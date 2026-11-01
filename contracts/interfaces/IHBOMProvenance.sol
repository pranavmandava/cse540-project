// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  IHBOMProvenance
 * @author CSE 540 Group 18
 * @notice Interface for an electronics Hardware Bill of Materials (HBOM)
 *         provenance and compliance registry.
 *
 * @dev    The contract is the trust layer of a multi-tier electronics supply
 *         chain. Four kinds of participant act on it, each behind an
 *         OpenZeppelin AccessControl role:
 *
 *           SUPPLIER_ROLE  - tier-2 vendors. Register component batches and
 *                            attach compliance documents (RoHS / REACH / FCC).
 *           ASSEMBLER_ROLE - tier-1 manufacturers. Link registered component
 *                            batches into a board-level HBOM.
 *           AUDITOR_ROLE   - regulators / third-party labs. Attest that a
 *                            document hash matches the file they reviewed.
 *                            They can also revoke an attestation later.
 *           CUSTODIAN_ROLE - holders of a finished board. Custody moves with an
 *                            explicit two-step offer/accept, so a sender cannot
 *                            push a board onto an unwilling recipient.
 *
 *         Design boundary: this contract proves *document integrity and
 *         custody history*, not physical authenticity. It cannot tell whether a
 *         resistor is genuine, only whether the certificate attached to it is
 *         the same file an auditor reviewed.
 *
 *         Off-chain: full PDFs live on IPFS. Only the content identifier (CID)
 *         and a keccak256 hash of the bytes are stored here, so anyone can
 *         re-hash a downloaded file and compare.
 */
interface IHBOMProvenance {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @notice The compliance document families the prototype tracks.
    /// @dev    Compliance is evaluated against all three, for every component.
    enum CertType {
        RoHS,
        REACH,
        FCC
    }

    /// @notice Lifecycle of a board's physical custody.
    enum CustodyState {
        None, // board does not exist
        InCustody, // held by `custodian`, no transfer pending
        InTransit // `custodian` has offered it to `pendingCustodian`
    }

    /// @notice A registered component batch from a tier-2 supplier.
    struct Component {
        string componentId; // human-readable batch id, e.g. "MCU-STM32-2026Q4-A"
        bytes32 datasheetHash; // keccak256 of the datasheet JSON
        string datasheetCID; // IPFS CID of the datasheet
        address supplier; // who registered it; the only address allowed to add certs
        uint64 registeredAt; // block timestamp
        bool exists; // guard against zero-value structs
    }

    /// @notice One version of one compliance document for one component.
    /// @dev    Multiple certificates of the same CertType may exist. A newer
    ///         document supersedes an older one without deleting the history,
    ///         which is what an auditor needs during a recall.
    struct Certificate {
        uint256 id; // sequential, starts at 1
        string componentId; // component this document belongs to
        CertType certType; // RoHS / REACH / FCC
        bytes32 docHash; // keccak256 of the PDF bytes
        string docCID; // IPFS CID of the PDF
        address issuedBy; // supplier who uploaded it
        address attestedBy; // auditor who checked the file; 0x0 until attested
        uint64 issuedAt;
        uint64 attestedAt; // 0 until attested
        bool attested;
        bool revoked; // revoked attestations stop counting toward compliance
    }

    /// @notice An assembled board and its current custody holder.
    struct Board {
        string boardId; // e.g. "PCB-CTRL-0001"
        address assembler; // tier-1 manufacturer that created the HBOM
        address custodian; // current physical holder
        address pendingCustodian; // nominated recipient while InTransit
        CustodyState state;
        uint64 assembledAt;
        bool exists;
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    // Every state change emits an event. Auditors and buyers reconstruct the
    // full history from logs, which is cheaper than reading storage and works
    // for participants who were never granted a role.

    event ComponentRegistered(
        string indexed componentId,
        address indexed supplier,
        bytes32 datasheetHash,
        string datasheetCID
    );

    event CertificateAdded(
        uint256 indexed certId,
        string indexed componentId,
        CertType certType,
        bytes32 docHash,
        string docCID,
        address indexed issuedBy
    );

    event CertificateAttested(uint256 indexed certId, address indexed auditor);

    event CertificateRevoked(uint256 indexed certId, address indexed auditor, string reason);

    event BoardAssembled(string indexed boardId, address indexed assembler, uint256 componentCount);

    event TransferInitiated(string indexed boardId, address indexed from, address indexed to);

    event TransferAccepted(string indexed boardId, address indexed from, address indexed to);

    event TransferCancelled(string indexed boardId, address indexed by);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------
    // Custom errors instead of require strings: cheaper on gas and easier for
    // the frontend to map to a readable message.

    error EmptyId();
    error AlreadyExists(string id);
    error NotFound(string id);
    error NotComponentSupplier(string componentId, address caller);
    error NotCustodian(string boardId, address caller);
    error InvalidAddress();
    error InvalidHash();
    error SelfTransfer();
    error WrongCustodyState(CustodyState expected, CustodyState actual);
    error NoComponents();
    error TooManyComponents(uint256 given, uint256 max);
    error DuplicateComponentInBatch(string componentId);
    error AlreadyAttested(uint256 certId);
    error AlreadyRevoked(uint256 certId);
    error SelfAttestation();

    // ------------------------------------------------------------------
    // Supplier actions
    // ------------------------------------------------------------------

    /// @notice Register a component batch. Caller must hold SUPPLIER_ROLE.
    /// @param componentId   Unique batch identifier chosen by the supplier.
    /// @param datasheetHash keccak256 of the datasheet content.
    /// @param datasheetCID  IPFS CID where the datasheet can be fetched.
    function registerComponent(
        string calldata componentId,
        bytes32 datasheetHash,
        string calldata datasheetCID
    ) external;

    /// @notice Attach a compliance document to a component the caller registered.
    /// @dev    Only the supplier that registered the component may add documents
    ///         to it, so one vendor cannot overwrite another's evidence.
    /// @return certId Sequential id of the new certificate record.
    function addCertificate(
        string calldata componentId,
        CertType certType,
        bytes32 docHash,
        string calldata docCID
    ) external returns (uint256 certId);

    // ------------------------------------------------------------------
    // Auditor actions
    // ------------------------------------------------------------------

    /// @notice Confirm that a document hash matches the file the caller reviewed.
    /// @dev    An auditor may not attest their own upload (separation of duties).
    function attestCertificate(uint256 certId) external;

    /// @notice Withdraw a prior attestation, e.g. after a failed re-inspection.
    /// @dev    Revoked certificates remain readable but no longer satisfy
    ///         compliance checks.
    function revokeCertificate(uint256 certId, string calldata reason) external;

    // ------------------------------------------------------------------
    // Assembler actions
    // ------------------------------------------------------------------

    /// @notice Create a board HBOM from existing, registered component batches.
    /// @dev    Reverts if any component is unknown, the list is empty, or the
    ///         same component appears twice. The assembler becomes the first
    ///         custodian of the board.
    function assembleHBOM(string calldata boardId, string[] calldata componentIds) external;

    // ------------------------------------------------------------------
    // Custody actions (two-step handover)
    // ------------------------------------------------------------------

    /// @notice Offer custody of a board to `newCustodian`. State becomes InTransit.
    function initiateTransfer(string calldata boardId, address newCustodian) external;

    /// @notice Accept a pending offer. Caller must be `pendingCustodian`.
    function acceptTransfer(string calldata boardId) external;

    /// @notice Withdraw a pending offer before it is accepted.
    function cancelTransfer(string calldata boardId) external;

    // ------------------------------------------------------------------
    // Read-only access
    // ------------------------------------------------------------------

    function getComponent(string calldata componentId) external view returns (Component memory);

    function getCertificate(uint256 certId) external view returns (Certificate memory);

    /// @notice Every certificate ever attached to a component, oldest first.
    function getComponentCertificates(string calldata componentId)
        external
        view
        returns (Certificate[] memory);

    function getBoard(string calldata boardId) external view returns (Board memory);

    function getBoardComponents(string calldata boardId)
        external
        view
        returns (string[] memory);

    /// @notice Evaluate a board against the compliance rule.
    /// @dev    A board is compliant only when every component has at least one
    ///         attested, non-revoked certificate of every required CertType.
    /// @return compliant True when nothing is missing.
    /// @return missing   Human-readable list such as "MCU-01:REACH", empty when compliant.
    function verifyCompliance(string calldata boardId)
        external
        view
        returns (bool compliant, string[] memory missing);

    /// @notice Full audit trail for one board, in a single call.
    /// @dev    Intended for the buyer-facing provenance page and for auditors
    ///         doing a batch inspection.
    function getBoardLineage(string calldata boardId)
        external
        view
        returns (
            Board memory board,
            string[] memory componentIds,
            Component[] memory components,
            Certificate[][] memory certificates
        );
}
