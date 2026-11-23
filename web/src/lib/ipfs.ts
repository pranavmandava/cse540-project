import { useCallback, useState } from "react";
import { hashFile } from "./hash";

export type UploadState = "idle" | "uploading" | "uploaded" | "error";

/**
 * File picker + local keccak256 + best-effort IPFS pin via /api/ipfs.
 *
 * The hash is the trust anchor and is always computed locally, before
 * anything leaves the machine. The upload is convenience: if Pinata is not
 * configured (no PINATA_JWT secret), the CID field simply stays manual.
 */
export function useIpfsFile() {
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [cid, setCid] = useState("");
  const [upload, setUpload] = useState<{ state: UploadState; message?: string }>({
    state: "idle",
  });

  const onFile = useCallback(async (next: File | null) => {
    setFile(next);
    setCid("");
    setUpload({ state: "idle" });

    if (!next) {
      setHash(null);
      return;
    }

    setHash((await hashFile(next)).hash);
    setUpload({ state: "uploading" });

    try {
      const form = new FormData();
      form.append("file", next);
      const response = await fetch("/api/ipfs", { method: "POST", body: form });

      if (response.ok) {
        const result = (await response.json()) as { cid?: string };
        if (result.cid) {
          setCid(result.cid);
          setUpload({ state: "uploaded" });
          return;
        }
      }

      const detail =
        response.status === 503
          ? "IPFS upload is not configured — type the CID manually."
          : ((await response.json().catch(() => null)) as { error?: string } | null)?.error ??
            `Upload failed (${response.status}).`;
      setUpload({ state: "error", message: detail });
    } catch (error) {
      setUpload({
        state: "error",
        message: `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setHash(null);
    setCid("");
    setUpload({ state: "idle" });
  }, []);

  return { file, hash, cid, setCid, upload, onFile, reset };
}
