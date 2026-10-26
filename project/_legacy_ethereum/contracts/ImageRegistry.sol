// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ImageRegistry
 * @notice On-chain provenance registry for artwork.
 *
 * Each artwork is keyed by the SHA-256 digest of its file bytes ("cryptographic
 * hash"). Alongside it we store a perceptual hash (pHash), which survives
 * resizing and recompression, so near-duplicates can be found off-chain by
 * comparing Hamming distance between pHashes pulled from this registry.
 *
 * Hashes are stored as bytes32 rather than string: a SHA-256 digest is exactly
 * 32 bytes, so this is cheaper to store, cheaper to compare, and makes the
 * mapping key fixed-width. The 64-bit pHash is left-padded into a bytes32.
 */
contract ImageRegistry {
    struct Record {
        address owner;        // provenance owner (the artist)
        address registrant;   // account that submitted and paid for the tx
        uint64  timestamp;    // block timestamp of registration
        uint64  blockNumber;  // block height of registration
        bytes32 perceptualHash;
        bool    exists;
    }

    mapping(bytes32 => Record) private _records;
    bytes32[] private _hashList;

    /// Reverse index from an exact pHash to every file registered under it.
    mapping(bytes32 => bytes32[]) private _byPerceptualHash;

    event ImageRegistered(
        bytes32 indexed cryptographicHash,
        bytes32 indexed perceptualHash,
        address indexed owner,
        address registrant,
        uint256 timestamp
    );

    event OwnershipTransferred(
        bytes32 indexed cryptographicHash,
        address indexed previousOwner,
        address indexed newOwner
    );

    error AlreadyRegistered(bytes32 cryptographicHash);
    error NotRegistered(bytes32 cryptographicHash);
    error NotOwner(bytes32 cryptographicHash, address caller);
    error ZeroHash();
    error IndexOutOfBounds(uint256 index, uint256 length);

    // ---------------------------------------------------------------- writes

    /**
     * @notice Register artwork under the caller's own address.
     * @param cryptographicHash SHA-256 of the file bytes.
     * @param perceptualHash    pHash of the rendered image (may be zero).
     */
    function registerImage(bytes32 cryptographicHash, bytes32 perceptualHash) external {
        _register(cryptographicHash, perceptualHash, msg.sender);
    }

    /**
     * @notice Register artwork on behalf of another address.
     * @dev Used by the backend relayer: it pays the gas but credits ownership to
     *      the artist's address. Anyone may call this, and the caller is recorded
     *      separately as `registrant`, so off-chain policy can decide how much to
     *      trust a given relayer.
     */
    function registerImageFor(
        bytes32 cryptographicHash,
        bytes32 perceptualHash,
        address owner
    ) external {
        _register(cryptographicHash, perceptualHash, owner == address(0) ? msg.sender : owner);
    }

    /// @notice Transfer provenance ownership of a registered work.
    function transferOwnership(bytes32 cryptographicHash, address newOwner) external {
        Record storage r = _records[cryptographicHash];
        if (!r.exists) revert NotRegistered(cryptographicHash);
        if (r.owner != msg.sender) revert NotOwner(cryptographicHash, msg.sender);

        address previous = r.owner;
        r.owner = newOwner;
        emit OwnershipTransferred(cryptographicHash, previous, newOwner);
    }

    function _register(bytes32 cryptographicHash, bytes32 perceptualHash, address owner) private {
        if (cryptographicHash == bytes32(0)) revert ZeroHash();
        if (_records[cryptographicHash].exists) revert AlreadyRegistered(cryptographicHash);

        _records[cryptographicHash] = Record({
            owner: owner,
            registrant: msg.sender,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            perceptualHash: perceptualHash,
            exists: true
        });

        _hashList.push(cryptographicHash);
        if (perceptualHash != bytes32(0)) {
            _byPerceptualHash[perceptualHash].push(cryptographicHash);
        }

        emit ImageRegistered(
            cryptographicHash,
            perceptualHash,
            owner,
            msg.sender,
            block.timestamp
        );
    }

    // ----------------------------------------------------------------- reads

    /// @notice True if this exact file has already been registered.
    function isHashRegistered(bytes32 cryptographicHash) external view returns (bool) {
        return _records[cryptographicHash].exists;
    }

    /**
     * @notice Full provenance record for a hash.
     * @return exists         whether the hash is registered
     * @return owner          current provenance owner
     * @return registrant     address that submitted the transaction
     * @return timestamp      block timestamp of registration
     * @return blockNumber    block height of registration
     * @return perceptualHash stored pHash
     */
    function getRecord(bytes32 cryptographicHash)
        external
        view
        returns (
            bool exists,
            address owner,
            address registrant,
            uint64 timestamp,
            uint64 blockNumber,
            bytes32 perceptualHash
        )
    {
        Record memory r = _records[cryptographicHash];
        return (r.exists, r.owner, r.registrant, r.timestamp, r.blockNumber, r.perceptualHash);
    }

    /// @notice Files registered under an identical pHash (exact match only).
    function getHashesByPerceptualHash(bytes32 perceptualHash)
        external
        view
        returns (bytes32[] memory)
    {
        return _byPerceptualHash[perceptualHash];
    }

    function getTotalRegisteredHashes() external view returns (uint256) {
        return _hashList.length;
    }

    function getHashAtIndex(uint256 index) external view returns (bytes32) {
        if (index >= _hashList.length) revert IndexOutOfBounds(index, _hashList.length);
        return _hashList[index];
    }

    /**
     * @notice Paginated dump of (cryptographicHash, perceptualHash) pairs.
     * @dev Lets a client pull every stored pHash to run Hamming-distance
     *      similarity checks off-chain, without needing an archive node or a
     *      full log scan.
     */
    function getPerceptualHashPage(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory cryptographicHashes, bytes32[] memory perceptualHashes)
    {
        uint256 total = _hashList.length;
        if (offset >= total) {
            return (new bytes32[](0), new bytes32[](0));
        }

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        cryptographicHashes = new bytes32[](size);
        perceptualHashes = new bytes32[](size);

        for (uint256 i = 0; i < size; i++) {
            bytes32 h = _hashList[offset + i];
            cryptographicHashes[i] = h;
            perceptualHashes[i] = _records[h].perceptualHash;
        }
    }

    /// @notice Batch existence check: one RPC round trip instead of N.
    function areHashesRegistered(bytes32[] calldata hashes)
        external
        view
        returns (bool[] memory results)
    {
        results = new bool[](hashes.length);
        for (uint256 i = 0; i < hashes.length; i++) {
            results[i] = _records[hashes[i]].exists;
        }
    }
}
