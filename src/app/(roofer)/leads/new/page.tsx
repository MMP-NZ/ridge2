import { PageHeader, Screen } from "@/components/ui";
import { AddLeadForm } from "./add-lead-form";

export default function NewLeadPage() {
  return (
    <Screen>
      <PageHeader
        backHref="/leads"
        backLabel="Leads"
        title="Add a lead"
        description="For a call or a doorstep enquiry that didn't come through the website or ads."
      />
      <AddLeadForm />
    </Screen>
  );
}
