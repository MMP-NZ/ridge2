import { AddLeadForm } from "./add-lead-form";

export default function NewLeadPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add a lead</h1>
      <p className="text-sm text-muted">For a call or a doorstep enquiry that didn&apos;t come through the website or ads.</p>
      <AddLeadForm />
    </main>
  );
}
