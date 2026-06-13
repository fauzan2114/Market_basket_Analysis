import { useMemo, useState } from "react";
import { API_BASE } from "../utils/api";
import { NavLink } from "react-router-dom";
import { FiBell, FiCopy, FiDownload, FiInfo, FiLoader, FiPlus, FiSearch, FiTarget, FiTrendingUp, FiX } from "react-icons/fi";
import type { AnalysisResult } from "../types";

type PredictionProps = {
  analysis: AnalysisResult | null;
  datasetLoaded: boolean;
};

interface PurchasePrediction {
  likelihood_percent: number;
  confidence: string;
  explanation: string;
  risk_factors: string[];
}

type PredictApiResponse = {
  will_buy_high_quantity?: boolean | number;
  likelihood_percent?: number;
  confidence?: number;
  confidence_label?: string;
  explanation?: string;
  risk_factors?: string[];
  error?: string;
};

function Prediction({ analysis, datasetLoaded }: PredictionProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [predictionError, setPredictionError] = useState("");
  const [predictionResult, setPredictionResult] = useState<PurchasePrediction | null>(null);
  const [hasRequested, setHasRequested] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");

  const allProducts = useMemo(() => {
    if (!analysis) {
      return [];
    }
    const products = new Set<string>();
    analysis.productCatalog?.forEach((item) => products.add(item.trim()));
    analysis.itemFrequency.forEach((item) => products.add(item.item));
    analysis.rules.forEach((rule) => {
      rule.antecedent.split(",").forEach((item) => products.add(item.trim()));
      rule.consequent.split(",").forEach((item) => products.add(item.trim()));
    });
    return Array.from(products).filter((item) => item.length > 0).sort();
  }, [analysis]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) {
      return [];
    }
    return allProducts
      .filter((item) => !selectedItems.includes(item) && item.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [allProducts, query, selectedItems]);

  const popularProducts = useMemo(() => {
    if (!analysis) {
      return [];
    }
    return analysis.itemFrequency
      .map((entry) => entry.item)
      .filter((item) => !selectedItems.includes(item))
      .slice(0, 8);
  }, [analysis, selectedItems]);

  const toggleItem = (item: string) => {
    setSelectedItems((prev) => (prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item]));
    setHasRequested(false);
    setPredictionResult(null);
    setPredictionError("");
  };

  const runPrediction = async () => {
    if (!analysis) {
      setPredictionError(
        datasetLoaded
          ? "Dataset uploaded, but analysis is not complete yet. Run analysis in Workspace first."
          : "Upload and analyze a dataset in Workspace first.",
      );
      setPredictionResult(null);
      setHasRequested(true);
      return;
    }

    if (selectedItems.length === 0) {
      setPredictionError("Add at least one product to the basket before predicting.");
      setPredictionResult(null);
      setHasRequested(true);
      return;
    }

    setIsLoading(true);
    setHasRequested(true);
    setPredictionError("");
    setPredictionResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          products: selectedItems,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = body?.error ?? "Prediction failed.";
        throw new Error(message);
      }

      const body = (await response.json()) as PredictApiResponse;
      if (body.will_buy_high_quantity === undefined) {
        throw new Error(body.error ?? "No prediction result returned.");
      }

      const rawLikelihood =
        typeof body.likelihood_percent === "number"
          ? body.likelihood_percent
          : typeof body.will_buy_high_quantity === "number"
            ? Math.round(body.will_buy_high_quantity * 100)
            : body.will_buy_high_quantity
              ? 75
              : 25;

      const confidenceLabel =
        body.confidence_label ??
        (typeof body.confidence === "number"
          ? body.confidence > 0.8
            ? "High"
            : body.confidence > 0.6
              ? "Moderate"
              : "Low"
          : "Moderate");

      setPredictionResult({
        likelihood_percent: Math.max(0, Math.min(100, rawLikelihood)),
        confidence: confidenceLabel,
        explanation:
          body.explanation ??
          `Based on the selected products, there is a ${Math.max(0, Math.min(100, rawLikelihood))}% likelihood of conversion.`,
        risk_factors: Array.isArray(body.risk_factors) ? body.risk_factors : [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Prediction failed.";
      setPredictionError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const getDecisionPlan = (likelihood: number, confidence: string) => {
    const confidenceIsHigh = confidence.toLowerCase().includes("high");

    if (likelihood >= 70 && confidenceIsHigh) {
      return {
        title: "High Intent: Act Now",
        action: "Trigger premium upsell or bundle offer immediately.",
        window: "Best action window: now to next 1 hour",
      };
    }

    if (likelihood >= 45) {
      return {
        title: "Medium Intent: Nudge",
        action: "Use gentle incentives (small discount, free shipping threshold, reminder prompt).",
        window: "Best action window: same session or within 24 hours",
      };
    }

    return {
      title: "Low Intent: Warm-Up",
      action: "Avoid heavy discounting now; use education, trust signals, or personalized content first.",
      window: "Best action window: nurture over next 2-7 days",
    };
  };

  const copyResult = () => {
    if (!predictionResult) {
      return;
    }

    const plan = getDecisionPlan(predictionResult.likelihood_percent, predictionResult.confidence);
    const text = `Purchase Likelihood Decision Brief
Likelihood: ${predictionResult.likelihood_percent}%
Confidence: ${predictionResult.confidence}
Decision: ${plan.title}
Recommended Action: ${plan.action}
Action Window: ${plan.window}
Explanation: ${predictionResult.explanation}
Risk Factors: ${predictionResult.risk_factors.length > 0 ? predictionResult.risk_factors.join(", ") : "None detected"}`;

    void navigator.clipboard.writeText(text);
    setCopyFeedback("Copied!");
    setTimeout(() => setCopyFeedback(""), 2000);
  };

  const exportBrief = () => {
    if (!predictionResult) {
      return;
    }

    const plan = getDecisionPlan(predictionResult.likelihood_percent, predictionResult.confidence);
    const content = [
      "Purchase Likelihood Decision Brief",
      `Likelihood: ${predictionResult.likelihood_percent}%`,
      `Confidence: ${predictionResult.confidence}`,
      `Decision: ${plan.title}`,
      `Recommended Action: ${plan.action}`,
      `Action Window: ${plan.window}`,
      `Explanation: ${predictionResult.explanation}`,
      `Risk Factors: ${predictionResult.risk_factors.length > 0 ? predictionResult.risk_factors.join(" | ") : "None"}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prediction-decision-brief.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLikelihoodColor = (percent: number) => {
    if (percent >= 70) {
      return "green";
    }
    if (percent >= 40) {
      return "blue";
    }
    return "amber";
  };

  const getConfidenceLabel = (conf: string) => {
    if (conf.toLowerCase().includes("high")) {
      return "green";
    }
    if (conf.toLowerCase().includes("moderate")) {
      return "blue";
    }
    return "amber";
  };

  const plan = predictionResult
    ? getDecisionPlan(predictionResult.likelihood_percent, predictionResult.confidence)
    : null;

  return (
    <div className="page-shell">
      <section className="hero-mini workflow-hero">
        <p className="hero-eyebrow">Predictive Analytics</p>
        <h1>Purchase Likelihood Predictor</h1>
        <p>
          Use this page for probability scoring and decision timing. For product recommendation scenarios, use Simulator.
        </p>
        <div className="hero-inline-metrics">
          <span>
            <FiTarget /> Intent Probability
          </span>
          <span>
            <FiTrendingUp /> Decision Guidance
          </span>
          <span>
            <FiBell /> Action Timing
          </span>
        </div>
      </section>

      <section className="analyzer-grid analyzer-grid-v2">
        <article className="surface-card analyzer-builder analyzer-builder-v2">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 1 of 2</p>
            <h2>Build Prediction Context</h2>
            <p>Add products currently in the customer context.</p>
          </div>

          {!analysis && (
            <article className="sim-card blocked-hint-card">
              <FiInfo className="blocked-hint-icon" />
              <p className="blocked-hint-title">{datasetLoaded ? "Dataset ready, analysis pending" : "No dataset loaded"}</p>
              <p className="blocked-hint-text">
                {datasetLoaded
                  ? "Run analysis in Workspace to unlock prediction outputs."
                  : "Upload and analyze a dataset in Workspace first to use predictions."}
              </p>
            </article>
          )}

          <article className="sim-card">
            <p className="sim-card-title">Current Context ({selectedItems.length})</p>
            <div className="selected-basket selected-basket-v2">
              {selectedItems.length === 0 ? (
                <p className="muted-text">No items yet. Add products below to start prediction.</p>
              ) : (
                selectedItems.map((item) => (
                  <button key={item} type="button" className="basket-chip" onClick={() => toggleItem(item)}>
                    {item}
                    <FiX />
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="sim-card">
            <p className="sim-card-title">Add Products</p>

            {analysis && popularProducts.length > 0 && (
              <div className="sim-quick-section">
                <p className="sim-subsection-title">Popular Items</p>
                <div className="starter-template-row">
                  {popularProducts.map((item) => (
                    <button key={item} type="button" className="starter-template-chip" onClick={() => toggleItem(item)}>
                      <FiPlus /> {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="sim-search-section">
              <p className="sim-subsection-title">Search Catalog</p>
              <label className="rule-search-input simulator-search" htmlFor="pred-product-search">
                <FiSearch />
                <input
                  id="pred-product-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type product name..."
                  disabled={!analysis}
                />
              </label>

              <div className="product-pool product-pool-v2">
                {!analysis && <p className="muted-text">No products available yet.</p>}
                {analysis && query.trim().length < 2 && <p className="muted-text">Type at least 2 characters to search.</p>}
                {analysis && query.trim().length >= 2 && filteredProducts.length === 0 && (
                  <p className="muted-text">No products found. Try different keywords.</p>
                )}
                {analysis &&
                  filteredProducts.map((item) => (
                    <button key={item} type="button" className="product-pill" onClick={() => toggleItem(item)}>
                      <FiPlus /> {item}
                    </button>
                  ))}
              </div>
            </div>
          </article>

          <div className="profile-actions sim-primary-actions">
            <button className="primary-btn" type="button" onClick={runPrediction} disabled={isLoading || !analysis}>
              {isLoading ? <FiLoader className="spin" /> : <FiBell />}
              {isLoading ? "Predicting..." : "Score Intent"}
            </button>
          </div>
        </article>

        <article className="surface-card analyzer-results analyzer-results-v2">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 2 of 2</p>
            <h2>Decision Scorecard</h2>
            <p>Probability, confidence, timing, and recommended action.</p>
          </div>

          {!hasRequested && (
            <article className="sim-empty-state">
              <FiBell />
              <h3>Ready to score intent?</h3>
              <p>Add products and click Score Intent to generate a decision brief.</p>
            </article>
          )}

          {hasRequested && isLoading && (
            <article className="sim-empty-state">
              <FiLoader className="spin" />
              <h3>Scoring purchase intent...</h3>
              <p>Calculating likelihood and confidence from analysis patterns.</p>
            </article>
          )}

          {hasRequested && !isLoading && predictionError && (
            <article className="sim-error-state">
              <h3>
                <FiX /> Error
              </h3>
              <p>{predictionError}</p>
            </article>
          )}

          {hasRequested && !isLoading && !predictionError && predictionResult && plan && (
            <div className="pred-results-grid">
              <article className="pred-likelihood-card">
                <div className="pred-likelihood-inner">
                  <p className="pred-likelihood-label">Purchase Likelihood</p>
                  <p className={`pred-likelihood-value pred-likelihood-${getLikelihoodColor(predictionResult.likelihood_percent)}`}>
                    {predictionResult.likelihood_percent}%
                  </p>
                  <span className={`pred-confidence-badge pred-confidence-${getConfidenceLabel(predictionResult.confidence)}`}>
                    {predictionResult.confidence}
                  </span>
                </div>
              </article>

              <article className="pred-next-products">
                <p className="pred-section-title">Decision Recommendation</p>
                <p className="pred-explanation-text"><strong>{plan.title}</strong></p>
                <p className="pred-explanation-text">{plan.action}</p>
                <p className="pred-explanation-text">{plan.window}</p>
                <p className="pred-explanation-text" style={{ marginTop: "0.8rem" }}>
                  Need recommendation ideas? Open the scenario workspace.
                </p>
                <NavLink to="/simulator" className="ghost-btn" style={{ marginTop: "0.6rem", display: "inline-flex" }}>
                  Open Simulator
                </NavLink>
              </article>

              <article className="pred-explanation">
                <p className="pred-section-title">Why This Score?</p>
                <p className="pred-explanation-text">{predictionResult.explanation}</p>
              </article>

              {predictionResult.risk_factors.length > 0 && (
                <article className="pred-risk-factors">
                  <p className="pred-section-title">Risk Factors</p>
                  <ul className="pred-risk-list">
                    {predictionResult.risk_factors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                </article>
              )}

              <div className="pred-actions">
                <button className="pred-action-btn" onClick={copyResult}>
                  <FiCopy /> {copyFeedback || "Copy Decision Brief"}
                </button>
                <button className="pred-action-btn" onClick={exportBrief}>
                  <FiDownload /> Export Brief
                </button>
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default Prediction;
