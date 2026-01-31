#[allow(lint(public_entry))]
module onchaindrips::onchaindrips {
    use std::string::String;
    use sui::clock::{Self, Clock};

    // Errors
    const EShirtAlreadyMinted: u64 = 1;
    const EExceedsTotalSupply: u64 = 2;

    /// Admin capability: only the publisher gets one. Required for create_drop and mint_shirts.
    public struct AdminCap has key {
        id: UID,
    }

    /// A drop (collection) with fixed supply. Tracks how many shirts have been minted.
    public struct Drop has key {
        id: UID,
        name: String,
        total_supply: u64,
        minted_count: u64,
        walrus_blob_id: vector<u8>,
        created_at_ms: u64,
    }

    /// A shirt NFT. Belongs to a drop; can be claimed/transferred once.
    public struct Shirt has key, store {
        id: UID,
        drop_id: ID,
        serial: u64,
        is_minted: bool,
        minted_at_ms: u64,
        walrus_blob_id: vector<u8>,
    }

    // ============ Init ============

    /// Called once at publish. Creates a single AdminCap and sends it to the publisher.
    fun init(ctx: &mut TxContext) {
        let cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(cap, tx_context::sender(ctx));
    }

    // ============ Admin entry functions ============

    /// Create a new drop. Caller must hold AdminCap. Drop is transferred to sender.
    public entry fun create_drop(
        _admin: &AdminCap,
        name: String,
        total_supply: u64,
        walrus_blob_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let drop = Drop {
            id: object::new(ctx),
            name,
            total_supply,
            minted_count: 0,
            walrus_blob_id,
            created_at_ms: clock::timestamp_ms(clock),
        };
        transfer::transfer(drop, tx_context::sender(ctx));
    }

    /// Mint `count` shirts for the given drop. Serial numbers continue from drop.minted_count.
    /// Shirts are transferred to the sender. Fails if count would exceed total_supply.
    public entry fun mint_shirts(
        _admin: &AdminCap,
        drop: &mut Drop,
        count: u64,
        walrus_blob_id: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(drop.minted_count + count <= drop.total_supply, EExceedsTotalSupply);
        let sender = tx_context::sender(ctx);
        let mut i = 0u64;
        while (i < count) {
            let serial = drop.minted_count;
            let shirt = Shirt {
                id: object::new(ctx),
                drop_id: object::id(drop),
                serial,
                is_minted: false,
                minted_at_ms: 0,
                walrus_blob_id: copy_vector(&walrus_blob_id),
            };
            transfer::transfer(shirt, sender);
            drop.minted_count = serial + 1;
            i = i + 1;
        };
    }

    /// Mark shirt as minted and transfer it to `recipient`. Fails if already minted.
    public entry fun claim_and_transfer(
        mut shirt: Shirt,
        recipient: address,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(!shirt.is_minted, EShirtAlreadyMinted);
        shirt.is_minted = true;
        shirt.minted_at_ms = clock::timestamp_ms(clock);
        transfer::transfer(shirt, recipient);
    }

    // ============ View helpers ============

    public fun drop_name(drop: &Drop): String {
        drop.name
    }

    public fun drop_total_supply(drop: &Drop): u64 {
        drop.total_supply
    }

    public fun drop_minted_count(drop: &Drop): u64 {
        drop.minted_count
    }

    public fun drop_created_at_ms(drop: &Drop): u64 {
        drop.created_at_ms
    }

    public fun shirt_drop_id(shirt: &Shirt): ID {
        shirt.drop_id
    }

    public fun shirt_serial(shirt: &Shirt): u64 {
        shirt.serial
    }

    public fun shirt_is_minted(shirt: &Shirt): bool {
        shirt.is_minted
    }

    public fun shirt_minted_at_ms(shirt: &Shirt): u64 {
        shirt.minted_at_ms
    }

    // ============ Private ============

    fun copy_vector(bytes: &vector<u8>): vector<u8> {
        let mut out = vector::empty();
        let len = vector::length(bytes);
        let mut i = 0u64;
        while (i < len) {
            vector::push_back(&mut out, *vector::borrow(bytes, i));
            i = i + 1;
        };
        out
    }
}
