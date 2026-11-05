import Link from "next/link";

export default function InboundNotFound() {
  return (
    <>
      <p className="kicker">Missing</p>
      <h1>That load is not on file.</h1>
      <p className="lede">The link may be wrong. The delivery list is still here.</p>
      <p>
        <Link href="/" className="button primary">
          Back to deliveries
        </Link>
      </p>
    </>
  );
}
