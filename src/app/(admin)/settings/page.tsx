import { getSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <SettingsForm
      initial={{
        pharmacyName: settings.pharmacyName,
        address: settings.address,
        phone: settings.phone,
        invoicePrefix: settings.invoicePrefix,
      }}
    />
  );
}
