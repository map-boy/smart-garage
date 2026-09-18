export interface Part {
  id: string;
  name: string;
  partNumber: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  supplier: string;

  /**
   * When this part first came into the store, and when it last moved either
   * way. Stamped on the part itself rather than worked out by scanning the
   * ledger: the ledger is read newest-first and capped, so an old part's first
   * arrival falls outside the window and cannot be recovered from it.
   *
   * Optional because parts created before these existed have none. The
   * inventory screen falls back to the ledger for those and says so.
   */
  firstReceivedAt?: string;
  lastReceivedAt?: string;
  lastIssuedAt?: string;
}
