"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { RerankResult } from "./rerank";
import { DEFAULT_WEIGHTS, type CatalogSource, type FusionWeights, type RetrievalResult } from "./retrieval";
import type { Analysis, BuyingMode, Category, CategoryIntent, Frame, StoreProfile, Style } from "./types";

export type StoreTypeChoice = "physical" | "online" | "popup" | "none";
export type ScanSource = "video" | "photos" | "sample";
export type AnalysisStatus = "idle" | "extracting" | "analyzing" | "done" | "error";

export interface OnboardingState {
  storeType: StoreTypeChoice | null;
  storeName: string;
  description: string;
  storeCategory: string | null;
  source: ScanSource | null;
  sampleSlug: string | null;
  frames: Frame[];
  extractProgress: { done: number; total: number } | null;
  analysis: Partial<Analysis> | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  analysisMeta: {
    p50Ms?: number;
    mock?: boolean;
    provider?: string;
    model?: string;
    configuredModel?: string;
    effort?: string | null;
    fallbackReason?: string | null;
    issues?: string[];
    usage?: { input: number; output: number };
    ms?: number;
  } | null;
  profile: StoreProfile | null;
  personalized: boolean;
  retrieval: RetrievalResult | null;
  retrievalStatus: "idle" | "running" | "done" | "error";
  rerank: RerankResult | null;
  rerankStatus: "idle" | "running" | "done" | "error";
  rerankError?: string | null;
  retrievalError: string | null;
  weights: FusionWeights;
  catalogSource: CatalogSource;
  /** True once someone picked a catalog in the trace view; otherwise the default can move with deploys. */
  catalogChosen: boolean;
}

const initialState: OnboardingState = {
  storeType: null,
  storeName: "",
  description: "",
  storeCategory: null,
  source: null,
  sampleSlug: null,
  frames: [],
  extractProgress: null,
  analysis: null,
  analysisStatus: "idle",
  analysisError: null,
  analysisMeta: null,
  profile: null,
  personalized: true,
  retrieval: null,
  retrievalStatus: "idle",
  rerank: null,
  rerankStatus: "idle",
  retrievalError: null,
  weights: DEFAULT_WEIGHTS,
  catalogSource: "shopify",
  catalogChosen: false,
};

type Action =
  | { type: "hydrate"; state: Partial<OnboardingState> }
  | { type: "setStoreType"; value: StoreTypeChoice }
  | { type: "setDetails"; storeName: string; description: string }
  | { type: "setStoreCategory"; value: string }
  | { type: "setSource"; source: ScanSource; sampleSlug?: string | null }
  | { type: "setFrames"; frames: Frame[] }
  | { type: "setExtractProgress"; progress: { done: number; total: number } | null }
  | { type: "setAnalysisStatus"; status: AnalysisStatus; error?: string | null }
  | { type: "setAnalysis"; analysis: Partial<Analysis> | null }
  | { type: "setAnalysisMeta"; meta: OnboardingState["analysisMeta"] }
  | { type: "setProfile"; profile: StoreProfile | null }
  | { type: "patchProfile"; patch: Partial<StoreProfile> }
  | { type: "setPersonalized"; value: boolean }
  | { type: "setRetrieval"; retrieval: RetrievalResult | null }
  | { type: "setRetrievalStatus"; status: OnboardingState["retrievalStatus"]; error?: string | null }
  | { type: "setRerank"; rerank: RerankResult | null }
  | { type: "setRerankStatus"; status: OnboardingState["rerankStatus"]; error?: string | null }
  | { type: "setWeights"; weights: FusionWeights }
  | { type: "setCatalogSource"; source: CatalogSource }
  | { type: "resetScan" }
  | { type: "reset" };

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.state };
    case "setStoreType":
      return { ...state, storeType: action.value };
    case "setDetails":
      return { ...state, storeName: action.storeName, description: action.description };
    case "setStoreCategory":
      return { ...state, storeCategory: action.value };
    case "setSource":
      return { ...state, source: action.source, sampleSlug: action.sampleSlug ?? null };
    case "setFrames":
      return { ...state, frames: action.frames };
    case "setExtractProgress":
      return { ...state, extractProgress: action.progress };
    case "setAnalysisStatus":
      return { ...state, analysisStatus: action.status, analysisError: action.error ?? null };
    case "setAnalysis":
      return { ...state, analysis: action.analysis };
    case "setAnalysisMeta":
      return { ...state, analysisMeta: action.meta ? { ...(state.analysisMeta ?? {}), ...action.meta } : null };
    case "setProfile":
      return { ...state, profile: action.profile };
    case "patchProfile":
      return state.profile ? { ...state, profile: { ...state.profile, ...action.patch } } : state;
    case "setPersonalized":
      return { ...state, personalized: action.value };
    case "setRetrieval":
      return { ...state, retrieval: action.retrieval };
    case "setRetrievalStatus":
      return { ...state, retrievalStatus: action.status, retrievalError: action.error ?? null };
    case "setRerank":
      return { ...state, rerank: action.rerank };
    case "setRerankStatus":
      return { ...state, rerankStatus: action.status, rerankError: action.error ?? null };
    case "setWeights":
      return { ...state, weights: action.weights };
    case "setCatalogSource":
      return { ...state, catalogSource: action.source, catalogChosen: true };
    case "resetScan":
      return {
        ...state,
        source: null,
        sampleSlug: null,
        frames: [],
        extractProgress: null,
        analysis: null,
        analysisStatus: "idle",
        analysisError: null,
        analysisMeta: null,
        profile: null,
        retrieval: null,
        retrievalStatus: "idle",
  rerank: null,
  rerankStatus: "idle",
        retrievalError: null,
      };
    case "reset":
      return initialState;
  }
}

const STORAGE_KEY = "store-scan-state-v1";
const MAX_PERSISTED_FRAME_BYTES = 3_500_000;

const Ctx = createContext<{ state: OnboardingState; dispatch: (a: Action) => void; hydrated: boolean } | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // Read persisted state exactly once (StrictMode runs effects twice in dev),
  // and never write to storage until that read has happened.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<OnboardingState>;
        // Never resume mid-analysis; the stream is gone.
        if (saved.analysisStatus === "analyzing" || saved.analysisStatus === "extracting") saved.analysisStatus = "idle";
        if (saved.retrievalStatus === "running") saved.retrievalStatus = "idle";
        if (!saved.rerank) saved.rerank = null;
        if (saved.rerankStatus !== "done") saved.rerankStatus = "idle";
        if (!saved.weights) saved.weights = DEFAULT_WEIGHTS;
        if (saved.profile && typeof saved.profile.explore !== "number") saved.profile = { ...saved.profile, explore: 0.5, strength: 0.8 };
        if (!saved.catalogSource || !saved.catalogChosen) saved.catalogSource = "shopify";
        dispatch({ type: "hydrate", state: saved });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist lazily: serializing a few MB of frames on every streamed delta would
  // jank the reveal on a phone, so debounce and skip the hot analysis phase.
  useEffect(() => {
    if (!hydrated) return;
    if (state.analysisStatus === "analyzing" || state.analysisStatus === "extracting") return;
    const t = setTimeout(() => {
      try {
        // Full frames when they fit; otherwise the 640px copies (plenty for retrieval and the recap),
        // so a long walkthrough still reaches the matching step after a page load.
        const full = state.frames.reduce((n, f) => n + f.dataUrl.length, 0);
        let frames: Frame[] = state.frames.map((f) => ({ id: f.id, dataUrl: f.dataUrl, timestampMs: f.timestampMs, source: f.source }));
        if (full >= MAX_PERSISTED_FRAME_BYTES) {
          const shrunk = state.frames.map(({ small, ...f }) => ({ ...f, dataUrl: small ?? f.dataUrl }));
          frames = shrunk.reduce((n, f) => n + f.dataUrl.length, 0) < MAX_PERSISTED_FRAME_BYTES ? shrunk : [];
        }
        const toSave = { ...state, frames };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch {
        /* quota or private mode: fine */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const value = useMemo(() => ({ state, dispatch, hydrated }), [state, hydrated]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  const { state, dispatch, hydrated } = ctx;
  const setCategoryIntent = useCallback(
    (name: Category, intent: CategoryIntent) => {
      if (!state.profile) return;
      dispatch({
        type: "patchProfile",
        patch: { categories: state.profile.categories.map((c) => (c.name === name ? { ...c, intent } : c)) },
      });
    },
    [state.profile, dispatch],
  );
  const toggleStyle = useCallback(
    (style: Style) => {
      if (!state.profile) return;
      const has = state.profile.styles.includes(style);
      dispatch({
        type: "patchProfile",
        patch: { styles: has ? state.profile.styles.filter((s) => s !== style) : [...state.profile.styles, style] },
      });
    },
    [state.profile, dispatch],
  );
  const setMode = useCallback((mode: BuyingMode) => dispatch({ type: "patchProfile", patch: { mode } }), [dispatch]);
  const setExplore = useCallback(
    (explore: number) => dispatch({ type: "patchProfile", patch: { explore, mode: modeFromExplore(explore) } }),
    [dispatch],
  );
  const setStrength = useCallback((strength: number) => dispatch({ type: "patchProfile", patch: { strength } }), [dispatch]);
  return { state, dispatch, hydrated, setCategoryIntent, toggleStyle, setMode, setExplore, setStrength };
}

export function modeFromExplore(explore: number): BuyingMode {
  return explore < 0.34 ? "replenish" : explore < 0.67 ? "complement" : "discover";
}

/** Turn a finished analysis into the editable profile that drives ranking. */
export function profileFromAnalysis(
  a: Analysis,
  ctx: { storeName: string; storeType: string; description: string },
): StoreProfile {
  return {
    storeName: ctx.storeName,
    storeType: ctx.storeType,
    description: ctx.description,
    categories: a.categories.map((c) => ({ name: c.name, share: c.share, intent: "more" as CategoryIntent })),
    styles: a.styles.filter((s) => s.confidence !== "low").map((s) => s.name),
    materials: a.materials.map((m) => m.name),
    palette: a.palette,
    // Price is not something a camera can read reliably, so it never shapes ranking unless a retailer sets it.
    priceTier: "unknown",
    complements: a.suggested_complements.map((c) => c.category).filter((c) => !a.categories.some((s) => s.name === c)),
    mode: "complement",
    explore: 0.5,
    strength: 0.8,
    vibeWords: a.store_read.vibe_words,
    summary: a.store_read.summary,
  };
}
