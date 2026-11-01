// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IHBOMProvenance} from "./interfaces/IHBOMProvenance.sol";

/**
 * @title  HBOMProvenance
 * @author CSE 540 Group 18
 * @notice Draft implementation of the electronics HBOM provenance registry
 *         described in our project proposal.
 *
 * @dev    Storage model, in one paragraph: component batches are keyed by their
 *         string id; certificates are kept in a flat mapping with a sequential
 *         id and a per-component index of ids; boards are keyed by string id with
 *         a separate list of member components. Nothing is ever deleted, so a
 *         revoked attestation is a flag, not a removal. That keeps the audit
 *         trail intact, which is the whole point of the project.
 *
 *         Scope note: this is a course prototype. It assumes a small number of
 *         participants and a small HBOM (see MAX_COMPONENTS). Reading a board
 *         costs one storage read per component, and compliance checks scan a
 *         component's certificate list, which is fine at demo scale but would
 *         need an indexer at production scale.
 */
contract HBOMProvenance is IHBOMProvenance, AccessControl {
    // ------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------

    /// @notice Tier-2 component vendors. Register batches, upload documents.
    bytes32 public constant SUPPLIER_ROLE = keccak256("SUPPLIER_ROLE");

    /// @notice Tier-1 manufacturers. Assemble board-level HBOMs.
    bytes32 public constant ASSEMBLER_ROLE = keccak256("ASSEMBLER_ROLE");

    /// @notice Regulators and third-party labs. Attest or revoke documents.
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    /// @notice Anyone permitted to hold a board and receive custody.
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");

    // ------------------------------------------------------------------
    // Limits
    // ------------------------------------------------------------------

    /// @dev Prototype cap. Keeps assembleHBOM's duplicate check and the
    ///      buyer-facing lineage view at predictable gas cost.
    uint256 public constant MAX_COMPONENTS = 16;

    /// @dev Number of CertType members. Update if the enum grows.
    uint8 public constant REQUIRED_CERT_TYPES = 3;

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    mapping(string => Component) private _components;
    mapping(uint256 => Certificate) private _certificates;
    mapping(string => uint256[]) private _componentCertIds;
    mapping(string => Board) private _boards;
    mapping(string => string[]) private _boardComponents;

    uint256 private _nextCertId = 1;

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    /**
     * @param admin Receives DEFAULT_ADMIN_ROLE. Operational roles are granted
     *              separately by the deploy script so that role assignment is
     *              visible on-chain rather than hidden in the constructor.
     */
    constructor(address admin) {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------------------
    // Supplier actions
    // ------------------------------------------------------------------

    /// @inheritdoc IHBOMProvenance
    function registerComponent(
        string calldata componentId,
        bytes32 datasheetHash,
        string calldata datasheetCID
    ) external onlyRole(SUPPLIER_ROLE) {
        if (bytes(componentId).length == 0) revert EmptyId();
        if (_components[componentId].exists) revert AlreadyExists(componentId);
        if (datasheetHash == bytes32(0)) revert InvalidHash();

        _components[componentId] = Component({
            componentId: componentId,
            datasheetHash: datasheetHash,
            datasheetCID: datasheetCID,
            supplier: msg.sender,
            registeredAt: uint64(block.timestamp),
            exists: true
        });

        emit ComponentRegistered(componentId, msg.sender, datasheetHash, datasheetCID);
    }

    /// @inheritdoc IHBOMProvenance
    function addCertificate(
        string calldata componentId,
        CertType certType,
        bytes32 docHash,
        string calldata docCID
    ) external onlyRole(SUPPLIER_ROLE) returns (uint256 certId) {
        Component storage component = _components[componentId];
        if (!component.exists) revert NotFound(componentId);
        // Only the vendor that registered the batch may attach evidence to it.
        if (component.supplier != msg.sender) {
            revert NotComponentSupplier(componentId, msg.sender);
        }
        if (docHash == bytes32(0)) revert InvalidHash();

        certId = _nextCertId++;

        _certificates[certId] = Certificate({
            id: certId,
            componentId: componentId,
            certType: certType,
            docHash: docHash,
            docCID: docCID,
            issuedBy: msg.sender,
            attestedBy: address(0),
            issuedAt: uint64(block.timestamp),
            attestedAt: 0,
            attested: false,
            revoked: false
        });

        // Append to the component's index. Newest document is last; readers that
        // only want the current state should scan from the end.
        _componentCertIds[componentId].push(certId);

        emit CertificateAdded(certId, componentId, certType, docHash, docCID, msg.sender);
    }

    // ------------------------------------------------------------------
    // Auditor actions
    // ------------------------------------------------------------------

    /// @inheritdoc IHBOMProvenance
    function attestCertificate(uint256 certId) external onlyRole(AUDITOR_ROLE) {
        Certificate storage cert = _certificates[certId];
        if (cert.id == 0) revert NotFound("certificate");
        if (cert.attested) revert AlreadyAttested(certId);
        if (cert.revoked) revert AlreadyRevoked(certId);
        // An auditor confirming their own upload is not a second pair of eyes.
        if (cert.issuedBy == msg.sender) revert SelfAttestation();

        cert.attested = true;
        cert.attestedBy = msg.sender;
        cert.attestedAt = uint64(block.timestamp);

        emit CertificateAttested(certId, msg.sender);
    }

    /// @inheritdoc IHBOMProvenance
    function revokeCertificate(uint256 certId, string calldata reason)
        external
        onlyRole(AUDITOR_ROLE)
    {
        Certificate storage cert = _certificates[certId];
        if (cert.id == 0) revert NotFound("certificate");
        if (cert.revoked) revert AlreadyRevoked(certId);

        // Revocation is deliberately allowed even before attestation: an auditor
        // may reject a document outright after inspecting the file.
        cert.revoked = true;

        emit CertificateRevoked(certId, msg.sender, reason);
    }

    // ------------------------------------------------------------------
    // Assembler actions
    // ------------------------------------------------------------------

    /// @inheritdoc IHBOMProvenance
    function assembleHBOM(string calldata boardId, string[] calldata componentIds)
        external
        onlyRole(ASSEMBLER_ROLE)
    {
        if (bytes(boardId).length == 0) revert EmptyId();
        if (_boards[boardId].exists) revert AlreadyExists(boardId);

        uint256 count = componentIds.length;
        if (count == 0) revert NoComponents();
        if (count > MAX_COMPONENTS) revert TooManyComponents(count, MAX_COMPONENTS);

        // Validate before writing: either the whole batch is recorded or nothing is.
        for (uint256 i = 0; i < count; ++i) {
            string calldata id = componentIds[i];
            if (!_components[id].exists) revert NotFound(id);
            // Reject duplicates. O(n^2) is acceptable for n <= MAX_COMPONENTS.
            for (uint256 j = 0; j < i; ++j) {
                if (keccak256(bytes(componentIds[j])) == keccak256(bytes(id))) {
                    revert DuplicateComponentInBatch(id);
                }
            }
        }

        _boards[boardId] = Board({
            boardId: boardId,
            assembler: msg.sender,
            custodian: msg.sender,
            pendingCustodian: address(0),
            state: CustodyState.InCustody,
            assembledAt: uint64(block.timestamp),
            exists: true
        });

        for (uint256 i = 0; i < count; ++i) {
            _boardComponents[boardId].push(componentIds[i]);
        }

        emit BoardAssembled(boardId, msg.sender, count);
    }

    // ------------------------------------------------------------------
    // Custody actions
    // ------------------------------------------------------------------

    /// @inheritdoc IHBOMProvenance
    function initiateTransfer(string calldata boardId, address newCustodian)
        external
        onlyRole(CUSTODIAN_ROLE)
    {
        Board storage board = _boards[boardId];
        if (!board.exists) revert NotFound(boardId);
        if (board.state != CustodyState.InCustody) {
            revert WrongCustodyState(CustodyState.InCustody, board.state);
        }
        if (board.custodian != msg.sender) revert NotCustodian(boardId, msg.sender);
        if (newCustodian == address(0)) revert InvalidAddress();
        if (newCustodian == msg.sender) revert SelfTransfer();
        // The recipient must be enrolled, otherwise a typo'd address would
        // freeze the board in InTransit forever.
        if (!hasRole(CUSTODIAN_ROLE, newCustodian)) revert InvalidAddress();

        board.pendingCustodian = newCustodian;
        board.state = CustodyState.InTransit;

        emit TransferInitiated(boardId, msg.sender, newCustodian);
    }

    /// @inheritdoc IHBOMProvenance
    function acceptTransfer(string calldata boardId) external onlyRole(CUSTODIAN_ROLE) {
        Board storage board = _boards[boardId];
        if (!board.exists) revert NotFound(boardId);
        if (board.state != CustodyState.InTransit) {
            revert WrongCustodyState(CustodyState.InTransit, board.state);
        }
        if (board.pendingCustodian != msg.sender) revert NotCustodian(boardId, msg.sender);

        address previous = board.custodian;
        board.custodian = msg.sender;
        board.pendingCustodian = address(0);
        board.state = CustodyState.InCustody;

        emit TransferAccepted(boardId, previous, msg.sender);
    }

    /// @inheritdoc IHBOMProvenance
    function cancelTransfer(string calldata boardId) external onlyRole(CUSTODIAN_ROLE) {
        Board storage board = _boards[boardId];
        if (!board.exists) revert NotFound(boardId);
        if (board.state != CustodyState.InTransit) {
            revert WrongCustodyState(CustodyState.InTransit, board.state);
        }
        if (board.custodian != msg.sender) revert NotCustodian(boardId, msg.sender);

        board.pendingCustodian = address(0);
        board.state = CustodyState.InCustody;

        emit TransferCancelled(boardId, msg.sender);
    }

    // ------------------------------------------------------------------
    // Read-only access
    // ------------------------------------------------------------------

    /// @inheritdoc IHBOMProvenance
    function getComponent(string calldata componentId) external view returns (Component memory) {
        return _components[componentId];
    }

    /// @inheritdoc IHBOMProvenance
    function getCertificate(uint256 certId) external view returns (Certificate memory) {
        return _certificates[certId];
    }

    /// @inheritdoc IHBOMProvenance
    function getComponentCertificates(string calldata componentId)
        external
        view
        returns (Certificate[] memory)
    {
        return _certificatesOf(componentId);
    }

    /// @inheritdoc IHBOMProvenance
    function getBoard(string calldata boardId) external view returns (Board memory) {
        return _boards[boardId];
    }

    /// @inheritdoc IHBOMProvenance
    function getBoardComponents(string calldata boardId)
        public
        view
        returns (string[] memory)
    {
        return _boardComponents[boardId];
    }

    /// @inheritdoc IHBOMProvenance
    function verifyCompliance(string calldata boardId)
        external
        view
        returns (bool compliant, string[] memory missing)
    {
        if (!_boards[boardId].exists) revert NotFound(boardId);

        string[] memory components = _boardComponents[boardId];

        // Upper bound: every component could be missing every document type.
        string[] memory gaps = new string[](components.length * REQUIRED_CERT_TYPES);
        uint256 gapCount = 0;

        for (uint256 i = 0; i < components.length; ++i) {
            for (uint8 t = 0; t < REQUIRED_CERT_TYPES; ++t) {
                CertType required = CertType(t);
                if (!_hasAttestedCertificate(components[i], required)) {
                    gaps[gapCount++] = string.concat(
                        components[i],
                        ":",
                        _certTypeName(required)
                    );
                }
            }
        }

        // Shrink the over-sized buffer to the actual number of gaps.
        missing = new string[](gapCount);
        for (uint256 i = 0; i < gapCount; ++i) {
            missing[i] = gaps[i];
        }

        compliant = gapCount == 0;
    }

    /// @inheritdoc IHBOMProvenance
    function getBoardLineage(string calldata boardId)
        external
        view
        returns (
            Board memory board,
            string[] memory componentIds,
            Component[] memory components,
            Certificate[][] memory certificates
        )
    {
        board = _boards[boardId];
        if (!board.exists) revert NotFound(boardId);

        componentIds = _boardComponents[boardId];
        uint256 count = componentIds.length;

        components = new Component[](count);
        certificates = new Certificate[][](count);

        for (uint256 i = 0; i < count; ++i) {
            string memory id = componentIds[i];
            components[i] = _components[id];
            certificates[i] = _certificatesOf(id);
        }
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /// @dev True when `componentId` holds at least one usable certificate of
    ///      `certType`. A certificate counts only if a differently-keyed auditor
    ///      attested it and nobody has revoked it since.
    function _hasAttestedCertificate(string memory componentId, CertType certType)
        private
        view
        returns (bool)
    {
        uint256[] storage ids = _componentCertIds[componentId];
        for (uint256 i = 0; i < ids.length; ++i) {
            Certificate storage cert = _certificates[ids[i]];
            if (cert.certType == certType && cert.attested && !cert.revoked) {
                return true;
            }
        }
        return false;
    }

    /// @dev Materialise a component's certificate history for external readers.
    function _certificatesOf(string memory componentId)
        private
        view
        returns (Certificate[] memory out)
    {
        uint256[] storage ids = _componentCertIds[componentId];
        out = new Certificate[](ids.length);
        for (uint256 i = 0; i < ids.length; ++i) {
            out[i] = _certificates[ids[i]];
        }
    }

    /// @dev Stable, UI-ready label for a document type.
    function _certTypeName(CertType certType) private pure returns (string memory) {
        if (certType == CertType.RoHS) return "RoHS";
        if (certType == CertType.REACH) return "REACH";
        return "FCC";
    }
}
