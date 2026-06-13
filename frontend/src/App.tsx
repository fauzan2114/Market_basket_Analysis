import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { FiDatabase, FiLock, FiMoon, FiSun } from "react-icons/fi";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import BIAnalytics from "./pages/BIAnalytics";
import BasketSimulator from "./pages/BasketSimulator";
import Segmentation from "./pages/Segmentation";
import Prediction from "./pages/Prediction";
import type { AnalysisParams, AnalysisResult, ColumnMapping, MiningAlgorithm } from "./types";
import "./App.css";
import { API_BASE } from "./utils/api";

type ThemeMode = "light" | "dark";
type ReadinessState = "idle" | "dataset" | "ready";
type PageRequirement = "none" | "dataset" | "analysis";

type PageGuide = {
  eyebrow: string;
  title: string;
  description: string;
  actions: string[];
  requirement: PageRequirement;
};

const PAGE_GUIDES: Record<string, PageGuide> = {
  home: {
    eyebrow: "Platform Overview",
    title: "Welcome to Basket Sense",
    description: "Start in Workspace, then unlock advanced intelligence pages as your dataset becomes ready.",
    actions: [
      "Review the end-to-end workflow and capabilities",
      "Understand which pages unlock at each stage",
      "Jump directly to Workspace to begin",
    ],
    requirement: "none",
  },
  workspace: {
    eyebrow: "Data Workspace",
    title: "Upload and Analyze Your Dataset",
    description: "Import CSV data, tune mining parameters, and generate trusted associations from your own dataset.",
    actions: [
      "Upload a transaction CSV file",
      "Configure support, confidence, and lift thresholds",
      "Run analysis to unlock Simulator, Segmentation, Prediction, and Reports",
    ],
    requirement: "none",
  },
  reports: {
    eyebrow: "Reporting",
    title: "Executive Insights and Visual Reports",
    description: "Summarize transaction behavior, product demand, and strongest association signals.",
    actions: [
      "Review KPI and distribution visualizations",
      "Inspect top association rules and itemsets",
      "Use outputs for business reviews and planning",
    ],
    requirement: "analysis",
  },
  bi: {
    eyebrow: "Business Intelligence",
    title: "BI Dashboard and Drill-Down Analytics",
    description: "Explore transaction KPIs, product trends, and invoice-level drill-down from the active dataset.",
    actions: [
      "Review KPI cards and trend charts",
      "Inspect product-level metrics with co-purchase detail",
      "Explore transaction-level records and top rule snapshots",
    ],
    requirement: "analysis",
  },
  simulator: {
    eyebrow: "Recommendation Studio",
    title: "Basket Scenario Simulator",
    description: "Design what-if basket scenarios and test recommendation strategies from the active analysis.",
    actions: [
      "Create or search basket compositions",
      "Choose a business goal and simulation settings",
      "Compare recommendation outcomes for scenario planning",
    ],
    requirement: "analysis",
  },
  segmentation: {
    eyebrow: "Customer Intelligence",
    title: "Customer Segmentation",
    description: "Profile customer behavior and assign practical segments using the active dataset context.",
    actions: [
      "Provide customer profile attributes",
      "Run segment assignment and confidence scoring",
      "Use strategy guidance for marketing and retention",
    ],
    requirement: "analysis",
  },
  prediction: {
    eyebrow: "Predictive Intelligence",
    title: "Purchase Likelihood Prediction",
    description: "Estimate purchase likelihood, confidence, and action timing for a basket context.",
    actions: [
      "Build a customer basket context",
      "Generate likelihood and confidence outputs",
      "Use decision guidance for when and how to intervene",
    ],
    requirement: "analysis",
  },
};

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const saved = window.localStorage.getItem("basket-theme");
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveGuide(pathname: string): PageGuide {
  if (pathname === "/" || pathname === "") {
    return PAGE_GUIDES.home;
  }
  if (pathname.startsWith("/workspace") || pathname.startsWith("/dashboard")) {
    return PAGE_GUIDES.workspace;
  }
  if (pathname.startsWith("/reports")) {
    return PAGE_GUIDES.reports;
  }
  if (pathname.startsWith("/bi")) {
    return PAGE_GUIDES.bi;
  }
  if (pathname.startsWith("/simulator") || pathname.startsWith("/basket-simulator")) {
    return PAGE_GUIDES.simulator;
  }
  if (pathname.startsWith("/segmentation")) {
    return PAGE_GUIDES.segmentation;
  }
  if (pathname.startsWith("/prediction")) {
    return PAGE_GUIDES.prediction;
  }
  return PAGE_GUIDES.home;
}

type DatasetLockRouteProps = {
  isDatasetLoaded: boolean;
  pageTitle: string;
  children: ReactNode;
};

function DatasetLockRoute({ isDatasetLoaded, pageTitle, children }: DatasetLockRouteProps) {
  if (isDatasetLoaded) {
    return <>{children}</>;
  }

  return (
    <div className="page-shell">
      <section className="hero-mini workflow-hero">
        <p className="hero-eyebrow">Feature Locked</p>
        <h1>{pageTitle} unlocks after dataset upload</h1>
        <p>Upload your CSV in Workspace first. This ensures every advanced page works only on your current dataset.</p>
      </section>

      <section className="surface-card locked-feature-card">
        <h2>What to do next</h2>
        <p>
          Open Workspace, upload a CSV file, and then run analysis. Once your data is ready, this page will unlock
          automatically.
        </p>
        <NavLink to="/workspace" className="primary-cta">
          <FiDatabase /> Open Workspace
        </NavLink>
      </section>
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [fileObject, setFileObject] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisRunAt, setAnalysisRunAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  const readiness: ReadinessState = analysis ? "ready" : fileName ? "dataset" : "idle";
  const isDatasetLoaded = Boolean(fileName);

  const workspaceStatus =
    readiness === "ready"
      ? { label: "Insights Ready", tone: "ready" }
      : readiness === "dataset"
        ? { label: "Dataset Loaded", tone: "pending" }
        : { label: "Awaiting Dataset", tone: "idle" };

  const pageGuide = useMemo(() => resolveGuide(location.pathname), [location.pathname]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("basket-theme", theme);
  }, [theme]);

  const onFileSelected = (file: File) => {
    if (!file) {
      return;
    }

    setError("");
    setAnalysis(null);
    setFileName(file.name);
    setFileSize(file.size);
    setFileObject(file);

    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      setError("Could not read the file. Please try another CSV/Excel file.");
    };
    
    // Try to read as text (works for CSV), Excel files will also be read
    reader.readAsText(file);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    onFileSelected(file);
  };

  const clearDataset = () => {
    setFileName("");
    setFileSize(null);
    setCsvText("");
    setAnalysis(null);
    setAnalysisRunAt(null);
    setError("");
  };

  const runAnalysis = async (params: AnalysisParams, columnMapping?: ColumnMapping) => {
    if (!csvText && !fileObject) {
      setError("Upload a CSV file first.");
      return;
    }

    try {
      // For Excel files, send file via multipart form-data
      if (fileObject && (fileObject.name.toLowerCase().endsWith('.xlsx') || fileObject.name.toLowerCase().endsWith('.xls'))) {
        const formData = new FormData();
        formData.append('file', fileObject);
        formData.append('algorithm', params.algorithm);
        formData.append('min_support', String(params.minSupport));
        formData.append('min_confidence', String(params.minConfidence));
        formData.append('min_lift', String(params.minLift));
        formData.append('top_n', String(params.topN));
        formData.append('column_mapping', JSON.stringify(columnMapping ?? {}));

        const response = await fetch(`${API_BASE}/api/analyze`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string; alert?: string } | null;
          const message = body?.alert ?? body?.error ?? "Dataset not suitable for mining.";
          setAnalysis(null);
          setError(message);
          window.alert(message);
          return;
        }

        const body = (await response.json()) as { analysis: AnalysisResult; algorithm: MiningAlgorithm; alert?: string };
        setAnalysis(body.analysis);
        setAnalysisRunAt(new Date().toISOString());
        setError("");
        if (body.alert) {
          window.alert(body.alert);
        }
      } else {
        // For CSV files, send as JSON
        const response = await fetch(`${API_BASE}/api/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            csv_text: csvText,
            algorithm: params.algorithm,
            min_support: params.minSupport,
            min_confidence: params.minConfidence,
            min_lift: params.minLift,
            top_n: params.topN,
            column_mapping: columnMapping ?? {},
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string; alert?: string } | null;
          const message = body?.alert ?? body?.error ?? "Dataset not suitable for mining.";
          setAnalysis(null);
          setError(message);
          window.alert(message);
          return;
        }

        const body = (await response.json()) as { analysis: AnalysisResult; algorithm: MiningAlgorithm; alert?: string };
        setAnalysis(body.analysis);
        setAnalysisRunAt(new Date().toISOString());
        setError("");
        if (body.alert) {
          window.alert(body.alert);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setAnalysis(null);
      setError(message);
      window.alert(message);
    }
  };

  const toggleTheme = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  const onLoadDemoData = () => {
    // Create a demo CSV dataset
    const demoCsvContent = `invoice,date,time,item,quantity,price,country
INV-2026-001,2026-01-15,10:30:00,Milk,2,3.50,UK
INV-2026-001,2026-01-15,10:30:00,Bread,1,2.50,UK
INV-2026-002,2026-01-15,14:45:00,Coffee,1,5.99,UK
INV-2026-002,2026-01-15,14:45:00,Sugar,2,1.50,UK
INV-2026-003,2026-01-15,16:20:00,Eggs,1,4.25,UK
INV-2026-003,2026-01-15,16:20:00,Cheese,1,6.99,UK
INV-2026-004,2026-01-16,09:15:00,Milk,3,3.50,UK
INV-2026-004,2026-01-16,09:15:00,Butter,1,5.25,UK
INV-2026-005,2026-01-16,11:30:00,Coffee,2,5.99,UK
INV-2026-005,2026-01-16,11:30:00,Bread,1,2.50,UK
INV-2026-006,2026-01-16,15:00:00,Milk,1,3.50,UK
INV-2026-006,2026-01-16,15:00:00,Bread,2,2.50,UK
INV-2026-007,2026-01-17,10:45:00,Eggs,2,4.25,UK
INV-2026-007,2026-01-17,10:45:00,Milk,1,3.50,UK
INV-2026-008,2026-01-17,13:20:00,Coffee,1,5.99,UK
INV-2026-008,2026-01-17,13:20:00,Bread,1,2.50,UK
INV-2026-009,2026-01-17,16:30:00,Cheese,1,6.99,UK
INV-2026-009,2026-01-17,16:30:00,Milk,2,3.50,UK`;
    
    // Create a File object from the CSV content
    const blob = new Blob([demoCsvContent], { type: 'text/csv' });
    const demoFile = new File([blob], 'demo-transactions.csv', { type: 'text/csv' });
    
    // Load the demo file
    onFileSelected(demoFile);
  };

  const navigation = [
    { label: "Home", to: "/", requiresDataset: false },
    { label: "Workspace", to: "/workspace", requiresDataset: false },
    { label: "Reports", to: "/reports", requiresDataset: true },
    { label: "BI", to: "/bi", requiresDataset: true },
    { label: "Simulator", to: "/simulator", requiresDataset: true },
    { label: "Segmentation", to: "/segmentation", requiresDataset: true },
    { label: "Prediction", to: "/prediction", requiresDataset: true },
  ] as const;

  const requirementLabel =
    pageGuide.requirement === "analysis"
      ? "Requires completed analysis"
      : pageGuide.requirement === "dataset"
        ? "Requires uploaded dataset"
        : "Available anytime";

  return (
    <>
      <header className="app-navbar">
        <div className="nav-container nav-container-pro">
          <div className="brand-block">
            <div className="brand-mark">Basket Sense</div>
            <p className="brand-sub">Market Basket Intelligence Studio</p>
          </div>
          <nav className="nav-links" aria-label="Primary">
            {navigation.map((item) => {
              const locked = item.requiresDataset && !isDatasetLoaded;
              if (locked) {
                return (
                  <span key={item.to} className="nav-link nav-link-locked" title="Upload dataset in Workspace to unlock">
                    <FiLock /> {item.label}
                  </span>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => {
                    const classes = ["nav-link"];
                    if (isActive) {
                      classes.push("active");
                    }
                    if (item.requiresDataset && readiness === "dataset") {
                      classes.push("pending");
                    }
                    return classes.join(" ");
                  }}
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="nav-status" aria-live="polite">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <FiMoon /> : <FiSun />}
              <span>{theme === "light" ? "Dark" : "Light"}</span>
            </button>
            <span className={`status-pill ${workspaceStatus.tone}`}>{workspaceStatus.label}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="page-context-bar" aria-live="polite">
          <div className="page-context-inner">
            <div className="page-context-copy">
              <p className="page-context-eyebrow">{pageGuide.eyebrow}</p>
              <h2>{pageGuide.title}</h2>
              <p>{pageGuide.description}</p>
            </div>
            <div className="page-context-details">
              <p className="page-context-requirement">{requirementLabel}</p>
              <ul>
                {pageGuide.actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Routes>
          <Route path="/" element={<Home hasDataset={isDatasetLoaded} hasInsights={Boolean(analysis)} fileName={fileName} onLoadDemoData={onLoadDemoData} />} />
          <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
          <Route
            path="/workspace"
            element={
              <Dashboard
                fileName={fileName}
                fileSize={fileSize}
                fileObject={fileObject}
                csvText={csvText}
                error={error}
                analysis={analysis}
                onFileChange={onFileChange}
                onFileSelected={onFileSelected}
                onClearDataset={clearDataset}
                runAnalysis={runAnalysis}
              />
            }
          />
          <Route
            path="/reports"
            element={
              <DatasetLockRoute isDatasetLoaded={isDatasetLoaded} pageTitle="Reports">
                <Reports analysis={analysis} />
              </DatasetLockRoute>
            }
          />
          <Route
            path="/bi"
            element={
              <DatasetLockRoute isDatasetLoaded={isDatasetLoaded} pageTitle="BI Analytics">
                <BIAnalytics analysis={analysis} datasetLoaded={isDatasetLoaded} />
              </DatasetLockRoute>
            }
          />
          <Route
            path="/simulator"
            element={
              <DatasetLockRoute isDatasetLoaded={isDatasetLoaded} pageTitle="Simulator">
                <BasketSimulator analysis={analysis} activeFileName={fileName} analyzedAt={analysisRunAt} />
              </DatasetLockRoute>
            }
          />
          <Route path="/basket-simulator" element={<Navigate to="/simulator" replace />} />
          <Route
            path="/segmentation"
            element={
              <DatasetLockRoute isDatasetLoaded={isDatasetLoaded} pageTitle="Segmentation">
                <Segmentation analysis={analysis} datasetLoaded={isDatasetLoaded} />
              </DatasetLockRoute>
            }
          />
          <Route
            path="/prediction"
            element={
              <DatasetLockRoute isDatasetLoaded={isDatasetLoaded} pageTitle="Prediction">
                <Prediction analysis={analysis} datasetLoaded={isDatasetLoaded} />
              </DatasetLockRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
