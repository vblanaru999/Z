import { ReceivingForm } from "../../../components/ReceivingForm";
import { PageHeader } from "../../../components/PageHeader";
import { localDateTimeInputValue } from "../../../lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "New delivery" };

export default function NewInboundPage() {
  return (
    <>
      <PageHeader
        kicker="New"
        title="New delivery"
        lede="Record the trailer. Saving leaves the delivery at New: on file, not confirmed yet."
      />
      <section className="panel">
        <ReceivingForm defaultArrivedAt={localDateTimeInputValue()} />
      </section>
    </>
  );
}
