import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { buttonPrimary, inputClass } from "@/components/ui";
import { createShop } from "@/lib/api-client";
import { useMe } from "./_layout";

export default function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me.data?.shop) navigate("/app");
  }, [me.data, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createShop({ name: name.trim(), cityId });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/app");
    } catch {
      toast.error(t("common.error"));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">{t("setup.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("setup.lead")}</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("setup.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("setup.city")}
          <select value={cityId} onChange={(e) => setCityId(e.target.value)} required className={inputClass}>
            <option value="" disabled>
              {t("setup.cityPlaceholder")}
            </option>
            {me.data?.cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonPrimary} disabled={busy || !cityId || !name.trim()}>
          {busy ? t("setup.creating") : t("setup.submit")}
        </button>
      </form>
    </div>
  );
}
