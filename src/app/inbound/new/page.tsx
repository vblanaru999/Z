import { ReceivingForm } from "../../../components/ReceivingForm";
import { PageHeader } from "../../../components/PageHeader";
import { localDateTimeInputValue } from "../../../lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receive a trailer" };

export default function NewInboundPage() {
  return (
    <>
      <PageHeader
        kicker="Stage 1"
        title="Receive a trailer"
        lede="Capture the load when it arrives. It stays in the waiting queue until someone unloads it."
      />
      <section className="panel">
        <ReceivingForm defaultArrivedAt={localDateTimeInputValue()} />
      </section>
    </>
  );
}
