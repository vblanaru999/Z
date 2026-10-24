"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <p className="kicker">Problem</p>
      <h1>Something went wrong.</h1>
      <p className="lede">{error.message || "The page could not be loaded."}</p>
      <button type="button" className="button primary" onClick={() => reset()}>
        Try again
      </button>
    </>
  );
}
