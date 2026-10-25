import { SettingsPage } from "@/components/settings/settings-page";
import { SettingsDemo } from "@/components/demo/settings";
import { DemoOr } from "@/components/demo/switch";

export default async function Page({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const s = Array.isArray(sp.s) ? sp.s[0] : sp.s;
  return <DemoOr demo={<SettingsDemo key={s} section={s} />} real={<SettingsPage />} />;
}
