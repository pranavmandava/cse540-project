import { keccak256, type Hex } from "viem";

/** keccak256 of the raw file bytes, the same value the contract stores. */
export async function hashFile(file: File): Promise<{ hash: Hex; size: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { hash: keccak256(bytes), size: bytes.length };
}
