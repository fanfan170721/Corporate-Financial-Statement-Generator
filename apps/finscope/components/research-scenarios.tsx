"use client";
import { useI18n } from "@/components/i18n";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { Check, Cloud, LoaderCircle, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { api, useApp } from "./shell";
import "./research-scenarios.css";
type SavedScenario = {
    id: string;
    kind: "allocation" | "liquidity";
    name: string;
    config: unknown;
    revision: number;
    createdAt: string;
    updatedAt: string;
};
export default function ResearchScenarios({ kind, config, onLoad, defaultName }: {
    kind: "allocation" | "liquidity";
    config: object;
    onLoad: (config: unknown) => void;
    defaultName: string;
}) {
const { t } = useI18n();
    const { viewer, accountError, refresh: retryAccount } = useApp();
    const [items, setItems] = useState<SavedScenario[]>([]);
    const [selected, setSelected] = useState("");
    const [name, setName] = useState(defaultName);
    const [savedSnapshot, setSavedSnapshot] = useState("");
    const [savedName, setSavedName] = useState("");
    const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const action = useRef<AbortController | null>(null);
    const userId = viewer?.user?.id;
    const snapshot = JSON.stringify(config);
    const dirty = snapshot !== savedSnapshot || name !== savedName;
    useEffect(() => {
        setSelected("");
        setItems([]);
        setSavedSnapshot("");
        setSavedName("");
        setLoadedRevision(null);
        setStatus("");
        setError(false);
        if (!userId)
            return;
        const controller = new AbortController();
        setLoading(true);
        api<{
            scenarios: SavedScenario[];
        }>(`/api/scenarios?kind=${kind}`, { signal: controller.signal }).then((result) => setItems(result.scenarios)).catch((cause: unknown) => { if (!controller.signal.aborted) {
            setStatus(cause instanceof Error ? cause.message : "Saved scenarios could not be loaded.");
            setError(true);
        } }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [userId, kind]);
    useEffect(() => () => action.current?.abort(), []);
    async function refresh() {
        setLoading(true);
        setError(false);
        try {
            const result = await api<{
                scenarios: SavedScenario[];
            }>(`/api/scenarios?kind=${kind}`);
            setItems(result.scenarios);
            setStatus("Scenario list refreshed. Load a scenario to use its latest saved version.");
        }
        catch (cause) {
            setStatus(cause instanceof Error ? cause.message : "Could not load scenarios. Please retry.");
            setError(true);
        }
        finally {
            setLoading(false);
        }
    }
    function load(id: string) {
        setConfirmDelete(false);
        if (!id) {
            setSelected("");
            setSavedSnapshot("");
            setSavedName("");
            setLoadedRevision(null);
            setName(defaultName);
            setStatus("Current assumptions retained. Save to create a new scenario in your account.");
            setError(false);
            return;
        }
        const item = items.find((candidate) => candidate.id === id);
        if (!item)
            return;
        try {
            onLoad(item.config);
            setSelected(id);
            setName(item.name);
            setSavedName(item.name);
            setLoadedRevision(item.revision);
            setSavedSnapshot(JSON.stringify(item.config));
            setStatus(`Loaded “${item.name}”.`);
            setError(false);
        }
        catch (cause) {
            setStatus(cause instanceof Error ? cause.message : "The scenario is incompatible. Your current assumptions are unchanged.");
            setError(true);
        }
    }
    async function save() {
        if (busy || !name.trim())
            return;
        const controller = new AbortController();
        action.current = controller;
        setBusy(true);
        setError(false);
        setStatus("Saving to your account…");
        const sentConfig = JSON.parse(snapshot) as object;
        const sentName = name.trim();
        try {
            const result = await api<{
                scenario: SavedScenario;
            }>(selected ? `/api/scenarios/${selected}` : "/api/scenarios", { method: selected ? "PATCH" : "POST", signal: controller.signal, body: JSON.stringify(selected ? { name: sentName, config: sentConfig, revision: loadedRevision } : { kind, name: sentName, config: sentConfig }) });
            setItems((current) => [result.scenario, ...current.filter((item) => item.id !== result.scenario.id)]);
            setSelected(result.scenario.id);
            setSavedSnapshot(JSON.stringify(result.scenario.config));
            setSavedName(result.scenario.name);
            setLoadedRevision(result.scenario.revision);
            setName(result.scenario.name);
            setStatus("Saved. Sign in to the same account to continue on another device.");
        }
        catch (cause) {
            setError(true);
            setStatus(controller.signal.aborted ? "Stopped waiting. The server may have completed the save. Refresh the list before submitting again." : cause instanceof Error ? cause.message : "Save failed. Your assumptions remain on this page.");
        }
        finally {
            if (action.current === controller)
                action.current = null;
            setBusy(false);
        }
    }
    async function remove() {
        if (!selected || busy)
            return;
        setBusy(true);
        setError(false);
        setConfirmDelete(false);
        try {
            await api(`/api/scenarios/${selected}`, { method: "DELETE" });
            setItems((current) => current.filter((item) => item.id !== selected));
            setSelected("");
            setSavedSnapshot("");
            setSavedName("");
            setStatus("Saved scenario deleted. The current assumptions remain on this page.");
        }
        catch (cause) {
            setError(true);
            setStatus(cause instanceof Error ? cause.message : "Could not delete the scenario.");
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="research-scenarios" aria-label={t("Saved research scenarios")}><div className="rs-heading"><span><Cloud size={16}/><strong>{t("Research scenarios")}</strong></span><span className="rs-sync-state">{busy ? <><LoaderCircle size={12} className="rs-spin"/>{" " + t("Saving")}</> : selected && !dirty ? <><Check size={12}/>{" " + t("Saved")}</> : t("Unsaved changes")}</span></div>{!userId ? <p className="rs-login">{viewer === null ? accountError ? <><span role="alert">{t(accountError)}</span> <button type="button" onClick={() => void retryAccount()}><RefreshCw size={12}/>{" " + t("Retry account connection")}</button></> : t("Connecting your account. You can adjust assumptions while it loads.") : <>{t("Save your assumptions to your account and continue your research on another device.")}<Link href="/login">{t("Sign in to save") + " "}<span>↗</span></Link></>}</p> : <><div className="rs-controls"><label className="rs-scenario-list"><span>{t("Saved scenario")}</span><select aria-label={t("Load a saved research scenario")} value={selected} disabled={loading || busy} onChange={(event) => load(event.target.value)}><option value="">{loading ? t("Loading\u2026") : t("New scenario / keep current assumptions")}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="rs-name"><span>{t("Scenario name")}</span><input value={name} maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder={t("Name this set of assumptions")}/></label><div className="rs-buttons"><button type="button" className="rs-save" onClick={save} disabled={busy || !name.trim() || !dirty}><Save size={14}/>{selected ? t("Save changes") : t("Save scenario")}</button><button type="button" onClick={() => load("")} disabled={busy} title={t("Keep these assumptions and create a new scenario")} aria-label={t("Create a new scenario")}><Plus size={15}/></button><button type="button" onClick={refresh} disabled={busy || loading} aria-label={t("Refresh saved scenarios")}><RefreshCw size={14} className={loading ? "rs-spin" : ""}/></button>{selected && <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} aria-label={t("Delete the selected saved scenario")}><Trash2 size={14}/></button>}</div></div>{confirmDelete && <div className="rs-delete" role="alert"><span>{t("Delete “{name}” from your account?", {name:items.find((item) => item.id === selected)?.name})}</span><button type="button" onClick={remove}>{t("Delete scenario")}</button><button type="button" onClick={() => setConfirmDelete(false)}>{t("Keep scenario")}</button></div>}</>}<div className={`rs-status ${error ? "rs-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite"><span>{t(status || (userId ? "Changes sync only when you save. Save before switching scenarios or leaving this page." : "Unsaved assumptions are not uploaded or written to browser storage."))}</span>{busy && action.current && <button type="button" onClick={() => action.current?.abort()}><X size={12}/>{" " + t("Stop waiting")}</button>}</div></section>;
}
