export const runtime = "nodejs";

import { getSafraMaisRecente } from "@/lib/safra-atual";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async () => jsonOk(await getSafraMaisRecente()));
