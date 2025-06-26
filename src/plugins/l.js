import { KJV } from "../../processing/KJV.ts";
console.log(KJV["GENESIS"].map(c => c?.join(" ") || "")?.join(" ") || "");
