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

    /// A drop (collection) with fixed supply.
    /// next_serial: next serial to assign when creating shirts. minted_count: number claimed (transferred to users), incremented in claim_and_transfer.
    /// No Walrus blob for the drop itself; drop is just event metadata.
    public struct Drop has key {
        id: UID,
        name: String,
        company_name: String,
        event_name: String,
        total_supply: u64,
        next_serial: u64,
        minted_count: u64,
        created_at_ms: u64,
    }

    /// A shirt NFT. Belongs to a drop; can be claimed/transferred once.
    /// Image and metadata are separate Walrus blobs.
    public struct Shirt has key, store {
        id: UID,
        drop_id: ID,
        serial: u64,
        is_minted: bool,
        minted_at_ms: u64,
        walrus_blob_id_image: vector<u8>,
        walrus_blob_id_metadata: vector<u8>,
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
    /// minted_count starts at 0; no Walrus blob for the drop.
    public entry fun create_drop(
        _admin: &AdminCap,
        drop_name: String,
        company_name: String,
        event_name: String,
        total_supply: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let drop = Drop {
            id: object::new(ctx),
            name: drop_name,
            company_name,
            event_name,
            total_supply,
            next_serial: 0,
            minted_count: 0,
            created_at_ms: clock::timestamp_ms(clock),
        };
        transfer::transfer(drop, tx_context::sender(ctx));
    }

    /// Mint `count` shirts for the given drop. Serial numbers from drop.next_serial; minted_count unchanged (incremented only in claim_and_transfer).
    /// drop has all drop details (name, company_name, event_name, total_supply, etc.).
    /// Fails if count would exceed total_supply.
    public entry fun mint_shirts(
        _admin: &AdminCap,
        drop: &mut Drop,
        count: u64,
        walrus_blob_id_image: vector<u8>,
        walrus_blob_id_metadata: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(drop.next_serial + count <= drop.total_supply, EExceedsTotalSupply);
        let sender = tx_context::sender(ctx);
        let mut i = 0u64;
        while (i < count) {
            let serial = drop.next_serial;
            let shirt = Shirt {
                id: object::new(ctx),
                drop_id: object::id(drop),
                serial,
                is_minted: false,
                minted_at_ms: 0,
                walrus_blob_id_image: copy_vector(&walrus_blob_id_image),
                walrus_blob_id_metadata: copy_vector(&walrus_blob_id_metadata),
            };
            transfer::transfer(shirt, sender);
            drop.next_serial = serial + 1;
            i = i + 1;
        };
    }

    /// Mark shirt as minted and transfer it to `recipient`. Increments drop.minted_count by 1. Fails if already minted.
    public entry fun claim_and_transfer(
        mut shirt: Shirt,
        drop: &mut Drop,
        recipient: address,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(!shirt.is_minted, EShirtAlreadyMinted);
        shirt.is_minted = true;
        shirt.minted_at_ms = clock::timestamp_ms(clock);
        drop.minted_count = drop.minted_count + 1;
        transfer::transfer(shirt, recipient);
    }

    // ============ View helpers ============

    public fun drop_name(drop: &Drop): String {
        drop.name
    }

    public fun drop_company_name(drop: &Drop): String {
        drop.company_name
    }

    public fun drop_event_name(drop: &Drop): String {
        drop.event_name
    }

    public fun drop_total_supply(drop: &Drop): u64 {
        drop.total_supply
    }

    public fun drop_next_serial(drop: &Drop): u64 {
        drop.next_serial
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

    public fun shirt_walrus_blob_id_image(shirt: &Shirt): vector<u8> {
        shirt.walrus_blob_id_image
    }

    public fun shirt_walrus_blob_id_metadata(shirt: &Shirt): vector<u8> {
        shirt.walrus_blob_id_metadata
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
