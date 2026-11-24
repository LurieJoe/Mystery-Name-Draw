/**
 * Hand the browser a file built in memory.
 *
 * The anchor is put in the document before it is clicked and the object
 * URL is revoked on a later tick: revoking it in the same tick as the
 * click cancels the download in some browsers, which fails silently and
 * looks exactly like a button that does nothing.
 */
export function downloadFile(
  filename: string,
  contents: string,
  type: string
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filename-safe version of a title, e.g. "Ms Dale's Class" -> "ms-dale-s-class". */
export function slugify(text: string, fallback: string) {
  return (
    text.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() ||
    fallback
  );
}
