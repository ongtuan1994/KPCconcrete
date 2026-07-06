import type { DeliveryTicket } from './real'
import raw from './ticketSeed.json'

/** Baked-in ใบจ่ายคอนกรีต snapshotted from the imported (uploaded) records so
    the company's real delivery tickets ship as production seed. Merged (deduped
    by dtNo) with runtime tickets + the built-in DELIVERY_TICKETS on the ใบจ่าย
    page only — kept out of DELIVERY_TICKETS so month-based reports don't mix
    years. Regenerate via the dev "ส่งออก seed" button into ticketSeed.json. */
export const SEED_IMPORTED_TICKETS = raw as DeliveryTicket[]
