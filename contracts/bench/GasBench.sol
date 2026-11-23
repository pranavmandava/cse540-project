// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  GasBench
 * @author CSE 540 Group 18
 * @notice Minimal single-purpose contracts used by `scripts/gas.ts` to price
 *         the storage-design alternatives discussed in `docs/gas-analysis.md`.
 *
 *         Fairness rules, so the deltas are attributable to the design
 *         choice and nothing else:
 *         - struct fields match `HBOMProvenance` one-for-one, changing only
 *           the representation under test (string id vs bytes32 id);
 *         - each measured function emits the same-shaped event as its
 *           counterpart in the main contract;
 *         - roles, errors and validation logic are kept equivalent.
 *
 *         These are measurement instruments, not production contracts.
 */

/**
 * @dev Alternative A — components and boards keyed by `bytes32` instead of
 *      `string`. An id of at most 31 characters fits a single slot, so a
 *      bytes32 registry avoids the multi-slot string writes (and re-hashings)
 *      that the real contract pays for human-readable ids of any length.
 */
contract Bytes32Bench {
    struct Comp {
        bytes32 componentId;
        bytes32 datasheetHash;
        string datasheetCID;
        address supplier;
        uint64 registeredAt;
        bool exists;
    }

    struct Board {
        bytes32 boardId;
        address assembler;
        address custodian;
        address pendingCustodian;
        uint8 state;
        uint64 assembledAt;
        bool exists;
    }

    event ComponentRegistered(bytes32 componentId, address indexed supplier, bytes32 datasheetHash, string datasheetCID);
    event BoardAssembled(bytes32 boardId, address indexed assembler, uint256 componentCount);

    error AlreadyExists();
    error NotFound();
    error Duplicate();

    mapping(bytes32 => Comp) private _components;
    mapping(bytes32 => Board) private _boards;
    mapping(bytes32 => bytes32[]) private _boardComponents;

    function register(bytes32 componentId, bytes32 datasheetHash, string calldata datasheetCID) external {
        if (_components[componentId].exists) revert AlreadyExists();
        _components[componentId] =
            Comp(componentId, datasheetHash, datasheetCID, msg.sender, uint64(block.timestamp), true);
        emit ComponentRegistered(componentId, msg.sender, datasheetHash, datasheetCID);
    }

    function assemble(bytes32 boardId, bytes32[] calldata componentIds) external {
        if (_boards[boardId].exists) revert AlreadyExists();
        uint256 count = componentIds.length;
        for (uint256 i = 0; i < count; ++i) {
            if (!_components[componentIds[i]].exists) revert NotFound();
            // Same duplicate policy as HBOMProvenance: O(n^2), n <= 16.
            for (uint256 j = 0; j < i; ++j) {
                if (componentIds[j] == componentIds[i]) revert Duplicate();
            }
        }
        _boards[boardId] =
            Board(boardId, msg.sender, msg.sender, address(0), 1, uint64(block.timestamp), true);
        for (uint256 i = 0; i < count; ++i) {
            _boardComponents[boardId].push(componentIds[i]);
        }
        emit BoardAssembled(boardId, msg.sender, count);
    }
}

/**
 * @dev Alternative B — a board stores one Merkle root of its HBOM instead of
 *      per-component certificate records. Assembly becomes a single slot
 *      write; compliance moves off-chain and the buyer proves membership of
 *      a leaf with a calldata-only path walk.
 */
contract MerkleBench {
    mapping(bytes32 => bytes32) private _boardRoots;

    event BoardRootStored(bytes32 indexed boardId, bytes32 hbomRoot);

    function assemble(bytes32 boardId, bytes32 hbomRoot) external {
        _boardRoots[boardId] = hbomRoot;
        emit BoardRootStored(boardId, hbomRoot);
    }

    /// @dev On-chain share of verification: recompute the path, compare roots.
    function verify(bytes32 boardId, bytes32 leaf, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; ++i) {
            computed = keccak256(bytes.concat(computed, proof[i]));
        }
        return computed == _boardRoots[boardId];
    }
}

/**
 * @dev Alternative C — flat `mapping(address => bool)` roles instead of
 *      OpenZeppelin AccessControl. One warm SLOAD replaces the two-step
 *      role-struct lookup, and enrollment skips the admin-branch check and
 *      RoleGranted bookkeeping — at the cost of losing the admin hierarchy,
 *      role introspection, and the standardized events.
 *
 *      The register body is byte-for-byte the storage writes of
 *      HBOMProvenance.registerComponent, so the delta against it is purely
 *      the access-control mechanism.
 */
contract FlatRoleBench {
    struct Comp {
        string componentId;
        bytes32 datasheetHash;
        string datasheetCID;
        address supplier;
        uint64 registeredAt;
        bool exists;
    }

    event ComponentRegistered(string componentId, address indexed supplier, bytes32 datasheetHash, string datasheetCID);

    error NotEnrolled();
    error AlreadyExists();

    mapping(address => bool) public isSupplier;
    mapping(string => Comp) private _components;

    function enroll(address account) external {
        isSupplier[account] = true;
    }

    modifier onlyEnrolled() {
        if (!isSupplier[msg.sender]) revert NotEnrolled();
        _;
    }

    function register(string calldata componentId, bytes32 datasheetHash, string calldata datasheetCID)
        external
        onlyEnrolled
    {
        if (_components[componentId].exists) revert AlreadyExists();
        _components[componentId] =
            Comp(componentId, datasheetHash, datasheetCID, msg.sender, uint64(block.timestamp), true);
        emit ComponentRegistered(componentId, msg.sender, datasheetHash, datasheetCID);
    }
}
