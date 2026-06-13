import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  FiCheckCircle,
  FiCpu,
  FiDatabase,
  FiFileText,
  FiInfo,
  FiInbox,
  FiLoader,
  FiSearch,
  FiUploadCloud,
  FiXCircle,
  FiZap,
} from "react-icons/fi";
import { NavLink } from "react-router-dom";
import type {
  AnalysisParams,
  AnalysisResult,
  CanonicalSchemaField,
  ColumnMapping,
  MiningAlgorithm,
  SchemaSuggestResponse,
} from "../types";
import { API_BASE } from "../utils/api";

type DashboardProps = {
  fileName: string;
  fileSize: number | null;
  fileObject: File | null;
  csvText: string;
  error: string;
  analysis: AnalysisResult | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFileSelected: (file: File) => void;
  onClearDataset: () => void;
  runAnalysis: (params: AnalysisParams, columnMapping?: ColumnMapping) => Promise<void>;
};

type WorkflowStageState = "idle" | "active" | "complete";
type PresetKey = "balanced" | "broad" | "strict";
type PresetSelection = PresetKey | "custom";

type SchemaAssistMode = "standard" | "enhanced" | "unknown";

const PRESET_PROFILES: Record<PresetKey, { label: string; description: string; params: AnalysisParams }> = {
  balanced: {
    label: "Balanced",
    description: "General-purpose settings for most retail datasets.",
    params: {
      algorithm: "fpgrowth",
      minSupport: 0.02,
      minConfidence: 0.2,
      minLift: 1,
      topN: 120,
    },
  },
  broad: {
    label: "Broad",
    description: "Capture more candidates for exploratory analysis and discovery.",
    params: {
      algorithm: "fpgrowth",
      minSupport: 0.005,
      minConfidence: 0.1,
      minLift: 0.8,
      topN: 240,
    },
  },
  strict: {
    label: "Strict",
    description: "Prioritize stronger and higher-confidence associations.",
    params: {
      algorithm: "apriori",
      minSupport: 0.03,
      minConfidence: 0.35,
      minLift: 1.2,
      topN: 80,
    },
  },
};

const PRESET_ORDER: PresetKey[] = ["balanced", "broad", "strict"];

const SCHEMA_FIELD_META: Array<{ key: CanonicalSchemaField; label: string; required?: boolean; hint: string }> = [
  { key: "item", label: "Item/Product", required: true, hint: "Primary product column used for basket mining." },
  { key: "invoice", label: "Invoice/Order", hint: "Transaction identifier for precise basket grouping." },
  { key: "date", label: "Date", hint: "Used for temporal trends and transaction fallback." },
  { key: "time", label: "Time", hint: "Used with date for stronger temporal grouping." },
  { key: "quantity", label: "Quantity", hint: "Optional quality filter for non-positive quantity rows." },
  { key: "price", label: "Price", hint: "Optional quality filter for non-positive price rows." },
  { key: "country", label: "Country", hint: "Optional geography distribution insights." },
];

function parseLocalCsvPreview(csvText: string): { headers: string[]; rows: Array<Record<string, string>> } {
  if (!csvText.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = csvText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < Math.min(lines.length, 11); i += 1) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function Dashboard({
  fileName,
  fileSize,
  fileObject,
  csvText,
  error,
  analysis,
  onFileChange,
  onFileSelected,
  onClearDataset,
  runAnalysis,
}: DashboardProps) {
  const [draftParams, setDraftParams] = useState<AnalysisParams>(PRESET_PROFILES.balanced.params);
  const [appliedParams, setAppliedParams] = useState<AnalysisParams>(PRESET_PROFILES.balanced.params);
  const [selectedPreset, setSelectedPreset] = useState<PresetSelection>("balanced");
  const [appliedPreset, setAppliedPreset] = useState<PresetSelection>("balanced");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const [schemaSuggestion, setSchemaSuggestion] = useState<SchemaSuggestResponse["suggestion"] | null>(null);
  const [schemaMapping, setSchemaMapping] = useState<ColumnMapping>({});
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState("");
  const [schemaAssistMode, setSchemaAssistMode] = useState<SchemaAssistMode>("unknown");

  const [analysisDurationSec, setAnalysisDurationSec] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const isExcelFile = Boolean(fileObject && /\.(xlsx|xls)$/i.test(fileObject.name));

  const workflowStages = useMemo(
    () => [
      {
        title: "Upload",
        subtitle: "Bring transaction data",
        state: (fileName ? "complete" : "active") as WorkflowStageState,
      },
      {
        title: "Configure",
        subtitle: "Review analysis profile",
        state: (fileName ? "active" : "idle") as WorkflowStageState,
      },
      {
        title: "Analyze",
        subtitle: "Run mining and open Reports",
        state: (analysis ? "complete" : isAnalyzing || fileName ? "active" : "idle") as WorkflowStageState,
      },
    ],
    [analysis, fileName, isAnalyzing],
  );

  useEffect(() => {
    if (!fileName) {
      setUploadProgress(0);
      return;
    }

    setUploadProgress(8);
    const intervalId = window.setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          window.clearInterval(intervalId);
          return 100;
        }
        return Math.min(prev + 12, 100);
      });
    }, 80);

    return () => window.clearInterval(intervalId);
  }, [fileName]);

  useEffect(() => {
    setSchemaSuggestion(null);
    setSchemaMapping({});
    setSchemaError("");
    setSchemaAssistMode("unknown");
    setAnalysisDurationSec(null);
  }, [csvText, fileName]);

  const requestSchemaSuggestion = async () => {
    setSchemaLoading(true);
    setSchemaError("");

    try {
      let response: Response;

      if (isExcelFile && fileObject) {
        const formData = new FormData();
        formData.append("file", fileObject);
        response = await fetch(`${API_BASE}/api/schema-suggest`, {
          method: "POST",
          body: formData,
        });
      } else if (csvText.trim()) {
        response = await fetch(`${API_BASE}/api/schema-suggest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            csv_text: csvText,
            sample_rows: 8,
            use_ai: true,
            ai_threshold: 0.75,
          }),
        });
      } else {
        setSchemaError("Upload a dataset first to detect schema mapping.");
        setSchemaLoading(false);
        return;
      }

      const body = (await response.json().catch(() => null)) as SchemaSuggestResponse | { error?: string } | null;
      if (!response.ok || !body || !("suggestion" in body)) {
        const message = body && "error" in body ? body.error ?? "Failed to suggest schema." : "Failed to suggest schema.";
        setSchemaSuggestion(null);
        setSchemaMapping({});
        setSchemaError(message);
        setSchemaAssistMode("unknown");
        return;
      }

      setSchemaSuggestion(body.suggestion);

      const initialMapping: ColumnMapping = {};
      SCHEMA_FIELD_META.forEach(({ key }) => {
        const candidate = body.suggestion.mapping[key];
        if (typeof candidate === "string" && candidate.trim()) {
          initialMapping[key] = candidate;
        }
      });
      setSchemaMapping(initialMapping);

      if (body.aiApplied) {
        setSchemaAssistMode("enhanced");
      } else {
        setSchemaAssistMode("standard");
      }
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : "Unknown error");
      setSchemaSuggestion(null);
      setSchemaMapping({});
      setSchemaAssistMode("unknown");
    } finally {
      setSchemaLoading(false);
    }
  };

  useEffect(() => {
    if (!fileName) {
      return;
    }
    void requestSchemaSuggestion();
  }, [fileName, fileObject]);

  const normalizedSchemaMapping = useMemo(() => {
    const mapping: ColumnMapping = {};
    Object.entries(schemaMapping).forEach(([field, value]) => {
      if (typeof value === "string" && value.trim()) {
        mapping[field as CanonicalSchemaField] = value;
      }
    });
    return mapping;
  }, [schemaMapping]);

  const missingRequiredMapping = useMemo(() => {
    if (!schemaSuggestion) {
      return ["item"] as CanonicalSchemaField[];
    }
    return (schemaSuggestion.requiredFields ?? ["item"]).filter((field) => !normalizedSchemaMapping[field]);
  }, [normalizedSchemaMapping, schemaSuggestion]);

  const schemaConfidence = schemaSuggestion?.overallConfidence ?? 0;

  const previewData = useMemo(() => {
    if (schemaSuggestion && schemaSuggestion.sampleRows.length > 0) {
      return {
        headers: schemaSuggestion.columns,
        rows: schemaSuggestion.sampleRows.slice(0, 10),
        source: "parsed",
      };
    }

    if (isExcelFile) {
      return {
        headers: [] as string[],
        rows: [] as Array<Record<string, string>>,
        source: "unavailable",
      };
    }

    const local = parseLocalCsvPreview(csvText);
    return {
      headers: local.headers,
      rows: local.rows,
      source: "local",
    };
  }, [csvText, isExcelFile, schemaSuggestion]);

  const columnQualityIssues = useMemo(() => {
    if (previewData.rows.length === 0 || previewData.headers.length === 0) {
      return [] as Array<{ column: string; issue: string; count: number }>;
    }

    const issues: Array<{ column: string; issue: string; count: number }> = [];

    previewData.headers.forEach((header) => {
      const values = previewData.rows.map((row) => String(row[header] ?? "").trim());
      const blankCount = values.filter((v) => v.length === 0).length;
      const negativeCount = values.filter((v) => {
        const num = Number(v);
        return !Number.isNaN(num) && num < 0;
      }).length;
      const zeroCount = values.filter((v) => v === "0").length;

      if (blankCount > 0) {
        const percent = Math.round((blankCount / values.length) * 100);
        issues.push({ column: header, issue: `${blankCount} blank cells (${percent}%)`, count: blankCount });
      }

      if (negativeCount > 0) {
        issues.push({ column: header, issue: `${negativeCount} negative values`, count: negativeCount });
      }

      if (zeroCount > 0 && (header.toLowerCase().includes("price") || header.toLowerCase().includes("quantity"))) {
        issues.push({ column: header, issue: `${zeroCount} zero values`, count: zeroCount });
      }
    });

    return issues;
  }, [previewData]);

  const estimatedRuleCount = useMemo(() => {
    const baseRules = draftParams.algorithm === "fpgrowth" ? 180 : 140;
    const supportFactor = Math.max(0.2, 1 - draftParams.minSupport * 30);
    const confidenceFactor = Math.max(0.3, 1 - draftParams.minConfidence * 1.5);
    const liftFactor = Math.max(0.5, 1 - draftParams.minLift * 0.3);
    return Math.min(Math.round(baseRules * supportFactor * confidenceFactor * liftFactor), 400);
  }, [draftParams]);

  const estimatedAnalysisTimeSec = useMemo(() => {
    const sizeMb = fileSize ? fileSize / (1024 * 1024) : 1;
    const algorithmFactor = draftParams.algorithm === "fpgrowth" ? 1.0 : 1.35;
    const supportFactor = Math.max(0.7, 1.2 - draftParams.minSupport * 4);
    const estimate = Math.round(Math.max(8, sizeMb * 2.5 * algorithmFactor * supportFactor));
    return estimate;
  }, [draftParams.algorithm, draftParams.minSupport, fileSize]);

  const qualityScore = useMemo(() => {
    if (!analysis || analysis.rules.length === 0) {
      return null;
    }
    const avgConfidence = analysis.rules.reduce((sum, rule) => sum + rule.confidence, 0) / analysis.rules.length;
    return Math.max(1, Math.min(10, Math.round(avgConfidence * 100) / 10));
  }, [analysis]);

  const hasPendingChanges = useMemo(
    () =>
      draftParams.algorithm !== appliedParams.algorithm ||
      draftParams.minSupport !== appliedParams.minSupport ||
      draftParams.minConfidence !== appliedParams.minConfidence ||
      draftParams.minLift !== appliedParams.minLift ||
      draftParams.topN !== appliedParams.topN,
    [appliedParams, draftParams],
  );

  const currentPresetDescription =
    selectedPreset === "custom" ? "Manual profile tuned by user controls." : PRESET_PROFILES[selectedPreset].description;

  const applyPreset = (presetKey: PresetKey) => {
    setSelectedPreset(presetKey);
    setDraftParams(PRESET_PROFILES[presetKey].params);
  };

  const updateDraftParams = (next: Partial<AnalysisParams>) => {
    setSelectedPreset("custom");
    setDraftParams((prev) => ({ ...prev, ...next }));
  };

  const applyDraftParams = () => {
    setAppliedParams(draftParams);
    setAppliedPreset(selectedPreset);
  };

  const resetDraftParams = () => {
    setDraftParams(appliedParams);
    setSelectedPreset(appliedPreset);
  };

  const formatFileSize = (size: number | null) => {
    if (!size) {
      return "";
    }
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleAnalyze = async () => {
    if (hasPendingChanges) {
      window.alert("You have unapplied profile changes. Click Apply Settings in Step 2 first.");
      return;
    }

    if (!schemaSuggestion && fileName) {
      window.alert("Schema mapping is still being prepared. Please wait a moment and try again.");
      return;
    }

    if (missingRequiredMapping.length > 0) {
      window.alert("Schema mapping is incomplete. Please map the required Item/Product field before analysis.");
      return;
    }

    setIsAnalyzing(true);
    const startedAt = Date.now();

    try {
      await runAnalysis(appliedParams, normalizedSchemaMapping);
      const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setAnalysisDurationSec(elapsedSec);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const clearDataset = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setAnalysisDurationSec(null);
    onClearDataset();
  };

  const updateSchemaField = (field: CanonicalSchemaField, value: string) => {
    setSchemaMapping((prev) => {
      const next = { ...prev };
      if (value.trim()) {
        next[field] = value;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const previewStats = [
    {
      label: "Upload Status",
      value: fileName ? "Ready" : "Waiting",
      icon: FiDatabase,
    },
    {
      label: "File Size",
      value: fileName ? formatFileSize(fileSize) : "0 KB",
      icon: FiFileText,
    },
    {
      label: "Ready to Analyze",
      value: fileName ? "Yes" : "No",
      icon: FiCheckCircle,
    },
  ];

  const mappingStatusLabel =
    schemaConfidence >= 0.8 ? "Standard Format" : schemaConfidence >= 0.6 ? "Custom Format" : "Complex Structure";

  return (
    <div className="page-shell workspace-shell">
      <section className="hero-mini workflow-hero">
        <p className="hero-eyebrow">Workspace</p>
        <h1>Structured Market Basket Workflow</h1>
        <p>
          Upload data, configure thresholds, run analysis, then review deep diagnostics in Reports and decision actions in Simulator.
        </p>
      </section>

      <section className="surface-card workflow-rail">
        {workflowStages.map((stage, index) => (
          <article key={stage.title} className={`workflow-step ${stage.state}`}>
            <span className="workflow-step-index">{index + 1}</span>
            <div>
              <h3>{stage.title}</h3>
              <p>{stage.subtitle}</p>
            </div>
            {stage.state === "complete" && <FiCheckCircle className="workflow-step-check" />}
          </article>
        ))}
      </section>

      <section className="workspace-stage surface-card upload-card premium-upload-card">
        <div className="stage-head">
          <p className="stage-kicker">Step 1</p>
          <h2>Upload Dataset</h2>
          <p>Bring your transaction CSV/Excel to initialize the workspace session.</p>
        </div>

        <div
          className={`upload-dropzone ${dragActive ? "drop-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <FiUploadCloud className="dropzone-icon" />
          <h4>Drag and drop CSV/Excel or browse</h4>
          <p>
            Drop your file here or
            <button type="button" className="dropzone-link" onClick={openFilePicker}>
              browse your device
            </button>
          </p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} />
          <div className="required-tags">
            <span className="tag-pill">required: product/item column</span>
            <span className="tag-pill">best: invoice/order + item</span>
          </div>
        </div>

        {fileName && (
          <div className="schema-mapper-card">
            <div className="schema-mapper-header">
              <div>
                <p className="stage-kicker">Schema Mapping</p>
                <h3>Schema Quality Indicator</h3>
                <p>
                  {schemaAssistMode === "enhanced"
                    ? "Non-standard dataset structure detected. Enhanced interpretation was used to map your columns."
                    : "Dataset structure matched standard patterns and was mapped directly."}
                </p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  void requestSchemaSuggestion();
                }}
                disabled={schemaLoading || !fileName}
              >
                {schemaLoading ? <FiLoader className="spin" /> : <FiSearch />} Detect Mapping
              </button>
            </div>

            <div className="schema-pill-row">
              <span className={`schema-pill ${missingRequiredMapping.length === 0 ? "ok" : "warn"}`}>
                {missingRequiredMapping.length === 0 ? "Ready for analysis" : "Required field missing"}
              </span>
              <span className={`schema-pill ${schemaConfidence >= 0.8 ? "ok" : schemaConfidence >= 0.6 ? "warn" : ""}`}>
                {mappingStatusLabel}
              </span>
              <span className="schema-pill">Confidence {Math.round(schemaConfidence * 100)}%</span>
            </div>

            {schemaLoading && <p className="control-note">Detecting column semantics and preparing mapping suggestions...</p>}
            {schemaError && <p className="error-pill">{schemaError}</p>}

            {schemaSuggestion && (
              <>
                <div className="schema-field-grid">
                  {SCHEMA_FIELD_META.map((field) => {
                    const fieldConfidence = schemaSuggestion.fieldConfidence[field.key] ?? 0;
                    const selectedValue = schemaMapping[field.key] ?? "";
                    const alternatives = schemaSuggestion.alternatives[field.key] ?? [];

                    return (
                      <article key={field.key} className={`schema-field-card ${field.required ? "required" : ""}`}>
                        <div className="schema-field-top">
                          <h4>
                            {field.label}
                            {field.required && <span>Required</span>}
                          </h4>
                          <strong>{Math.round(fieldConfidence * 100)}%</strong>
                        </div>
                        <select value={selectedValue} onChange={(event) => updateSchemaField(field.key, event.target.value)}>
                          <option value="">Not mapped</option>
                          {schemaSuggestion.columns.map((column) => (
                            <option key={`${field.key}-${column}`} value={column}>
                              {column}
                            </option>
                          ))}
                        </select>
                        <p>{field.hint}</p>
                        {alternatives.length > 0 && <small>Top candidates: {alternatives.slice(0, 3).join(", ")}</small>}
                      </article>
                    );
                  })}
                </div>

                {schemaSuggestion.notes.length > 0 && (
                  <div className="schema-notes">
                    <h4>Mapping notes</h4>
                    <ul>
                      {schemaSuggestion.notes.map((note, index) => (
                        <li key={`${note}-${index}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="upload-row action-row">
          <button className="secondary-btn" type="button" onClick={openFilePicker}>
            <FiUploadCloud /> Upload File
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={handleAnalyze}
            disabled={isAnalyzing || schemaLoading || !fileName || hasPendingChanges}
          >
            {isAnalyzing || schemaLoading ? <FiLoader className="spin" /> : <FiZap />}
            {isAnalyzing ? "Analyzing..." : schemaLoading ? "Preparing mapping..." : "Analyze Dataset"}
          </button>
          <button className="danger-btn" type="button" onClick={clearDataset} disabled={!fileName && !analysis}>
            <FiXCircle /> Remove Dataset
          </button>
        </div>

        {fileName && (
          <div className="file-preview">
            <FiFileText />
            <div>
              <strong>{fileName}</strong>
              <p>{formatFileSize(fileSize)} • ready for analysis</p>
            </div>
          </div>
        )}

        {fileName && (
          <div className="upload-progress-wrap">
            <div className="upload-progress-bar">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
            <small>
              Estimated run time: ~{estimatedAnalysisTimeSec}s
              {analysisDurationSec !== null ? ` • last run: ${analysisDurationSec}s` : ""}
            </small>
          </div>
        )}

        <div className="upload-mini-stats">
          {previewStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} className="upload-mini-card">
                <p>{stat.label}</p>
                <h4>{stat.value}</h4>
                <Icon />
              </article>
            );
          })}
        </div>

        {error && <p className="error-pill">{error}</p>}
      </section>

      {previewData.rows.length > 0 && (
        <section className="workspace-stage surface-card">
          <div className="stage-head">
            <h3>Data Preview</h3>
            <p>First {previewData.rows.length} rows of your dataset</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  {previewData.headers.map((header) => (
                    <th key={header} style={{ minWidth: "120px" }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {previewData.headers.map((header) => (
                      <td key={`${idx}-${header}`}>{String(row[header] ?? "-")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {previewData.source === "unavailable" && fileName && (
        <section className="workspace-stage surface-card">
          <div className="stage-head">
            <h3>Data Preview</h3>
            <p>Preview will appear after schema parsing completes for Excel files.</p>
          </div>
        </section>
      )}

      {columnQualityIssues.length > 0 && (
        <section className="workspace-stage surface-card">
          <div className="stage-head">
            <h3>Column Quality Report</h3>
            <p>Detected data issues that may affect analysis quality</p>
          </div>
          <div style={{ display: "grid", gap: "0.8rem" }}>
            {columnQualityIssues.slice(0, 8).map((issue, idx) => (
              <article
                key={idx}
                style={{
                  padding: "0.8rem",
                  background: "var(--warning-bg)",
                  borderRadius: "8px",
                  borderLeft: "3px solid #d97706",
                }}
              >
                <strong style={{ color: "var(--text-strong)" }}>{issue.column}</strong>
                <p style={{ margin: "0.3rem 0 0", color: "var(--text)", fontSize: "0.9rem" }}>{issue.issue}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="workspace-stage surface-card">
        <div className="stage-head">
          <p className="stage-kicker">Step 2</p>
          <h2>Configure Analysis Profile</h2>
          <p>Select algorithm and thresholds before running analysis.</p>
        </div>

        <div className="preset-strip">
          {PRESET_ORDER.map((presetKey) => {
            const preset = PRESET_PROFILES[presetKey];
            return (
              <button
                key={presetKey}
                type="button"
                className={`preset-chip ${selectedPreset === presetKey ? "active" : ""}`}
                onClick={() => applyPreset(presetKey)}
              >
                {preset.label}
              </button>
            );
          })}
          {selectedPreset === "custom" && <span className="preset-chip custom">Custom</span>}
        </div>

        <p className="control-note">{currentPresetDescription}</p>

        <div
          style={{
            padding: "0.8rem",
            marginBottom: "1rem",
            background: "var(--primary-soft)",
            borderRadius: "8px",
            border: "1px solid var(--primary)",
          }}
        >
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.85rem", color: "var(--muted)" }}>Estimated Results</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div>
              <strong style={{ fontSize: "1.3rem", color: "var(--primary)" }}>{estimatedRuleCount}</strong>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>rules expected</p>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", textAlign: "right" }}>
              <p style={{ margin: 0 }}>Lower thresholds → More rules</p>
              <p style={{ margin: "0.3rem 0 0" }}>Higher thresholds → Fewer, stronger rules</p>
            </div>
          </div>
        </div>

        <div className="control-grid">
          <article className="profile-tile control-card">
            <p>Algorithm</p>
            <div className="control-inline">
              <FiCpu />
              <select
                value={draftParams.algorithm}
                onChange={(e) => updateDraftParams({ algorithm: e.target.value as MiningAlgorithm })}
              >
                <option value="fpgrowth">FP-Growth</option>
                <option value="apriori">Apriori</option>
              </select>
            </div>
          </article>

          <article className="profile-tile control-card">
            <p>Min Support</p>
            <h4>{draftParams.minSupport.toFixed(3)}</h4>
            <input
              type="range"
              min="0.005"
              max="0.2"
              step="0.005"
              value={draftParams.minSupport}
              onChange={(e) => updateDraftParams({ minSupport: Number(e.target.value) })}
            />
          </article>

          <article className="profile-tile control-card">
            <p>Min Confidence</p>
            <h4>{draftParams.minConfidence.toFixed(2)}</h4>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={draftParams.minConfidence}
              onChange={(e) => updateDraftParams({ minConfidence: Number(e.target.value) })}
            />
          </article>

          <article className="profile-tile control-card">
            <p>Min Lift</p>
            <h4>{draftParams.minLift.toFixed(2)}</h4>
            <input
              type="range"
              min="0.5"
              max="8"
              step="0.1"
              value={draftParams.minLift}
              onChange={(e) => updateDraftParams({ minLift: Number(e.target.value) })}
            />
          </article>

          <article className="profile-tile control-card">
            <p>Top Rules</p>
            <h4>{draftParams.topN}</h4>
            <input
              type="range"
              min="20"
              max="400"
              step="20"
              value={draftParams.topN}
              onChange={(e) => updateDraftParams({ topN: Number(e.target.value) })}
            />
          </article>
        </div>

        <details className="algo-guide">
          <summary>
            <FiInfo /> What are FP-Growth and Apriori?
          </summary>
          <div className="algo-guide-grid">
            <article>
              <h4>FP-Growth</h4>
              <p>Builds a compact FP-tree and mines frequent patterns without huge candidate sets.</p>
              <span>Best for larger/sparse datasets with many unique products.</span>
            </article>
            <article>
              <h4>Apriori</h4>
              <p>Generates and tests candidate itemsets level-by-level.</p>
              <span>Useful for smaller datasets and easier conceptual explanation.</span>
            </article>
          </div>
        </details>

        <div className="profile-actions">
          <button className="secondary-btn" type="button" onClick={applyDraftParams} disabled={!hasPendingChanges}>
            Apply Settings
          </button>
          <button className="ghost-btn" type="button" onClick={resetDraftParams} disabled={!hasPendingChanges}>
            Reset Draft
          </button>
        </div>

        <p className="control-note">
          Applied profile: <strong>{appliedParams.algorithm.toUpperCase()}</strong> • support {appliedParams.minSupport.toFixed(3)} •
          confidence {appliedParams.minConfidence.toFixed(2)} • lift {appliedParams.minLift.toFixed(2)} • top {appliedParams.topN}
        </p>
        {hasPendingChanges && <p className="control-warning">You have unapplied changes. Apply Settings before analysis.</p>}
      </section>

      {!analysis && !error && (
        <section className="workspace-stage surface-card empty-card premium-empty">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 3</p>
            <h2>Run Analysis</h2>
            <p>Run analysis to unlock detailed diagnostics in Reports and decision actions in Simulator.</p>
          </div>
          <div className="empty-state-bg" />
          <div className="empty-icon-wrap" aria-hidden>
            <FiInbox />
          </div>
          <h3>No insights yet</h3>
          <p>Upload your dataset, verify mapping, then click Analyze Dataset.</p>
        </section>
      )}

      {analysis && (
        <section className="workspace-stage surface-card">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 3 Complete</p>
            <h2>Analysis Complete</h2>
            <p>Detailed rule inspection is now available in Reports. Recommendation actions are available in Simulator.</p>
          </div>

          <div className="kpi-grid">
            <article className="kpi-card">
              <p>Transactions</p>
              <h3>{analysis.totalTransactions.toLocaleString()}</h3>
            </article>
            <article className="kpi-card">
              <p>Unique Products</p>
              <h3>{analysis.uniqueItems.toLocaleString()}</h3>
            </article>
            <article className="kpi-card">
              <p>Rules</p>
              <h3>{analysis.rules.length.toLocaleString()}</h3>
            </article>
            <article className="kpi-card">
              <p>Run Time</p>
              <h3>{analysisDurationSec !== null ? `${analysisDurationSec}s` : `~${estimatedAnalysisTimeSec}s`}</h3>
            </article>
            <article className="kpi-card">
              <p>Quality Score</p>
              <h3>{qualityScore !== null ? `${qualityScore.toFixed(1)}/10` : "N/A"}</h3>
            </article>
          </div>

          <div className="upload-row action-row" style={{ marginTop: "0.9rem" }}>
            <NavLink to="/reports" className="primary-cta">
              Open Reports
            </NavLink>
            <NavLink to="/simulator" className="ghost-btn">
              Open Simulator
            </NavLink>
          </div>
        </section>
      )}
    </div>
  );
}

export default Dashboard;
