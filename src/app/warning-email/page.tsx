import { saveWarningTemplateAction } from "../actions";
import { Banner } from "../../components/Banner";
import { PageHeader } from "../../components/PageHeader";
import { SubmitButton } from "../../components/SubmitButton";
import { getStore } from "../../lib/db";
import { WARNING_PLACEHOLDERS } from "../../lib/email-copy";
import { firstParam } from "../../lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warning email" };

export default async function WarningEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
}) {
  const query = await searchParams;
  const template = await (await getStore()).getWarningTemplate();

  return (
    <>
      <PageHeader
        kicker="Email"
        title="Warning email"
        lede="This text is sent the next time you warn a driver. Each claim still fills in its own driver, failure, time, and order."
      />
      <Banner error={firstParam(query.error)} notice={firstParam(query.notice)} />
      <section className="panel">
        <form action={saveWarningTemplateAction} className="stack">
          <label className="field">
            Subject
            <input name="subject" defaultValue={template.subject} required maxLength={200} />
          </label>
          <label className="field">
            Message
            <textarea name="body" defaultValue={template.body} required rows={16} maxLength={20000} />
          </label>
          <div>
            <p className="hint">Use these in the subject or message. They are replaced for the claim you send.</p>
            <ul className="placeholder-list">
              {WARNING_PLACEHOLDERS.map((item) => (
                <li key={item.token}>
                  <code>{item.token}</code>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="form-actions">
            <SubmitButton className="button primary" pendingLabel="Saving…">
              Save template
            </SubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
