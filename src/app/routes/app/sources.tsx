import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Camera, Check, CloudSun, Megaphone, Plus, Search, ShoppingBag, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageBody } from "@/components/PageBody";
import { formatDate, formatValue } from "@/components/result/format";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { connectSource, disconnectSource, getData, getSources, type Connection, type DataResponse } from "@/lib/api-client";
import type { SourceDefinition } from "@/lib/sources/types";
import { useMe } from "./_layout";

/** 詳しい画面のグラフに出す日数 */
const DAYS = 90;

const ICONS: Record<SourceDefinition["icon"], LucideIcon> = {
  orders: ShoppingBag,
  ads: Megaphone,
  social: Camera,
  weather: CloudSun,
};

function SourceIcon({ icon }: { icon: SourceDefinition["icon"] }) {
  const Icon = ICONS[icon];
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white">
      <Icon className="size-5 text-black/50" />
    </span>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (points.length < 2) return null;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const d = points
    .map(([i, v], k) => `${k === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - lo) / (hi - lo || 1)) * 26).toFixed(2)}`)
    .join("");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" className="stroke-accent" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** データ源 (プラグイン)。上につないでいるもの、下に使えるものの一覧 (連携) */
export default function Sources() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const me = useMe();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [adding, setAdding] = useState<SourceDefinition | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const sources = useQuery({ queryKey: ["sources"], queryFn: getSources });
  const data = useQuery({ queryKey: ["data"], queryFn: getData });
  const demo = me.data?.user.demo ?? true;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["sources"] });
    void queryClient.invalidateQueries({ queryKey: ["data"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  };
  const remove = useMutation({
    mutationFn: disconnectSource,
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const available = sources.data?.available ?? [];
  const connected = sources.data?.connected ?? [];
  const definitionOf = (id: string) => available.find((s) => s.id === id)!;
  const isConnected = (id: string) => connected.some((c) => c.sourceId === id);
  const lastDate = data.data?.dates[data.data.dates.length - 1];
  const open = openId ? connected.find((c) => c.sourceId === openId) : undefined;
  const query = keyword.trim().toLowerCase();
  const catalog = query
    ? available.filter((s) => [s.label.en, s.label.ja, s.description.en, s.description.ja, s.format].some((text) => text.toLowerCase().includes(query)))
    : available;

  return (
    <PageBody
      title={t("sources.title")}
      action={
        <label className="flex h-9 items-center gap-2 rounded-2xl border border-black/20 bg-white px-3 shadow focus-within:border-black">
          <Search className="size-4 text-black/50" />
          <input
            className="w-32 bg-transparent text-sm outline-none placeholder:text-black/50 sm:w-48"
            value={keyword}
            placeholder={t("sources.search")}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
      }
    >
      {sources.isPending ? (
        <p className="pl-2 text-sm text-black/50">{t("common.loading")}</p>
      ) : sources.isError ? (
        <p className="pl-2 text-sm text-down">{t("common.error")}</p>
      ) : (
        <section className="space-y-6">
          <div>
            <h2 className="px-3 pb-2 text-sm font-semibold">{t("sources.connected")}</h2>
            {connected.map((connection) => {
              const source = definitionOf(connection.sourceId);
              return (
                <div key={connection.sourceId} className="group flex items-center gap-2 rounded-2xl p-3 transition-colors hover:bg-black/10">
                  <SourceIcon icon={source.icon} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(connection.sourceId)}>
                    <p className="truncate text-sm">{source.label[locale]}</p>
                    <p className="truncate text-xs text-black/50">
                      {connection.demo && `${t("sources.demoData")} ・ `}
                      {source.format}
                      {lastDate && ` ・ ${t("sources.until", { date: formatDate(lastDate, locale) })}`}
                    </p>
                  </button>
                  {!demo && (
                    <RowMenu
                      ariaLabel={t("sources.actions")}
                      disabled={remove.isPending}
                      items={[{ label: t("sources.remove"), icon: Trash2, danger: true, onSelect: () => remove.mutate(connection.sourceId) }]}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <h2 className="px-3 pb-2 text-sm font-semibold">{t("sources.catalog")}</h2>
            <div className="grid gap-1 sm:grid-cols-2">
              {catalog.map((source) => (
                <div key={source.id} className="group flex items-center gap-2 rounded-2xl p-3 transition-colors hover:bg-black/10">
                  <SourceIcon icon={source.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{source.label[locale]}</p>
                    <p className="truncate text-xs text-black/50">{source.description[locale]}</p>
                  </div>
                  {isConnected(source.id) ? (
                    <span className="inline-flex size-8 shrink-0 items-center justify-center text-accent" title={t("sources.isConnected")}>
                      <Check className="size-4" />
                    </span>
                  ) : (
                    !demo && (
                      <button
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-black/50 hover:bg-black/10 hover:text-black"
                        type="button"
                        aria-label={t("sources.addTitle", { name: source.label[locale] })}
                        title={t("sources.connect")}
                        onClick={() => setAdding(source)}
                      >
                        <Plus className="size-4" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {open && (
        <SourceDetail
          source={definitionOf(open.sourceId)}
          connection={open}
          data={data.data}
          cities={me.data?.cities ?? []}
          onClose={() => setOpenId(null)}
        />
      )}
      {adding && (
        <AddSource
          source={adding}
          missing={adding.dependsOn.filter((id) => !isConnected(id)).map((id) => definitionOf(id).label[locale])}
          cities={me.data?.cities ?? []}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            refresh();
          }}
        />
      )}
    </PageBody>
  );
}

/** 設定の値を、画面に出す文字にする (ファイルは、上げたファイルの名前と行数) */
function settingText(
  field: SourceDefinition["settings"][number],
  config: Record<string, unknown>,
  cities: { id: string; label: string }[],
  locale: Locale,
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  const value = config[field.key];
  if (field.type === "city") return cities.find((c) => c.id === value)?.label ?? String(value);
  if (field.type === "date") return formatDate(String(value), locale);
  if (field.type === "file") return `${String(config.filename)} ・ ${t("sources.rows", { count: Number(config.rows) })}`;
  return String(value);
}

function SourceDetail({
  source,
  connection,
  data,
  cities,
  onClose,
}: {
  source: SourceDefinition;
  connection: Connection;
  data: DataResponse | undefined;
  cities: { id: string; label: string }[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const metrics = data?.sources.find((s) => s.id === source.id)?.metrics ?? [];
  return (
    <Modal title={source.label[locale]} size="3xl" onClose={onClose}>
      <div className="space-y-5 px-6 pb-6">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {source.settings.map((field) => (
            <div key={field.key} className="flex justify-between gap-3 border-b border-black/10 py-1.5">
              <dt className="text-black/50">{field.label[locale]}</dt>
              <dd className="num truncate">{settingText(field, connection.config, cities, locale, t)}</dd>
            </div>
          ))}
        </dl>
        <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {metrics.map((m) => {
            const recent = m.values.slice(-DAYS);
            const last = [...recent].reverse().find((v) => v !== null);
            return (
              <li key={m.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{m.label[locale]}</span>
                  {last !== undefined && last !== null && <span className="num text-sm text-black/50">{formatValue(last, m.unit, locale)}</span>}
                </div>
                <Sparkline values={recent} />
                {m.latencyDays > 0 && <p className="text-xs text-black/50">{t("sources.latency", { count: m.latencyDays })}</p>}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-black/50">{t("sources.lastDays", { count: DAYS })}</p>
      </div>
    </Modal>
  );
}

/** 連携の「＋」から開く。データ源が宣言した設定の項目を入れてつなぐ */
function AddSource({
  source,
  missing,
  cities,
  onClose,
  onAdded,
}: {
  source: SourceDefinition;
  /** 値を作るのに要るのに、まだつないでいないデータ源の名前 */
  missing: string[];
  cities: { id: string; label: string }[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const add = useMutation({
    mutationFn: () => connectSource(source.id, settings, file ?? undefined),
    onSuccess: onAdded,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal title={t("sources.addTitle", { name: source.label[locale] })} onClose={onClose}>
      <form
        className="space-y-4 px-6 pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        {source.settings
          .filter((field) => field.type !== "seed")
          .map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs">{field.label[locale]}</span>
              {field.type === "file" ? (
                <input
                  className="input py-2 text-sm"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={async (event) => {
                    const chosen = event.target.files?.[0];
                    setFile(chosen ? { name: chosen.name, text: await chosen.text() } : null);
                  }}
                />
              ) : field.type === "city" ? (
                <select
                  className="input"
                  required
                  autoFocus
                  value={settings[field.key] ?? ""}
                  onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}
                >
                  <option value="" disabled />
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type="date"
                  required
                  value={settings[field.key] ?? ""}
                  onChange={(event) => setSettings({ ...settings, [field.key]: event.target.value })}
                />
              )}
            </label>
          ))}
        {source.via === "csv" && <p className="font-mono text-xs text-black/50">{source.format}</p>}
        {missing.length > 0 && <p className="text-sm text-down">{t("sources.needs", { names: missing.join(", ") })}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="button-primary" disabled={add.isPending || missing.length > 0}>
            {t("sources.connect")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
