import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <p className="kicker">Missing</p>
      <h1>That record is not on file.</h1>
      <p className="lede">It may have been a bad link. The board is still here.</p>
      <p>
        <Link href="/" className="button primary">
          Back to open claims
        </Link>
      </p>
    </>
  );
}
