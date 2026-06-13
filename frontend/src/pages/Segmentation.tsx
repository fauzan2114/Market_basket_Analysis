import { useMemo, useState } from "react";
import { API_BASE } from "../utils/api";
import { FiActivity, FiBarChart, FiCopy, FiDownload, FiInfo, FiLoader, FiTarget, FiX } from "react-icons/fi";
import type { AnalysisResult } from "../types";

type SegmentationProps = {
  analysis: AnalysisResult | null;
  datasetLoaded: boolean;
};

interface SegmentPrediction {
  segment_name: string;
  confidence: number;
  segment_profile: {
    size_percent: number;
    avg_purchase_value: number;
    top_products: string[];
  };
  characteristics: string;
  strategy: string;
}

function Segmentation({ analysis, datasetLoaded }: SegmentationProps) {
  const [ageGroup, setAgeGroup] = useState("25-34");
  const [frequency, setFrequency] = useState("monthly");
  const [region, setRegion] = useState("north");
  const [spendingTier, setSpendingTier] = useState("medium");

  const [isLoading, setIsLoading] = useState(false);
  const [segmentError, setSegmentError] = useState("");
  const [segmentResult, setSegmentResult] = useState<SegmentPrediction | null>(null);
  const [hasRequested, setHasRequested] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");

  const runSegmentation = async () => {
    if (!analysis) {
      setSegmentError(
        datasetLoaded
          ? "Dataset uploaded, but analysis is not complete yet. Run analysis in Workspace first."
          : "Upload and analyze a dataset in Workspace first.",
      );
      setSegmentResult(null);
      setHasRequested(true);
      return;
    }

    setIsLoading(true);
    setHasRequested(true);
    setSegmentError("");
    setSegmentResult(null);

    try {
      // Map UI inputs to backend parameters
      const purchaseCountMap = { monthly: 5, quarterly: 3, annually: 1, "bi-weekly": 8, weekly: 15, daily: 50 };
      const spendingMap = { low: 20, medium: 50, high: 100, premium: 200 };
      const regionMap = { north: 1, south: 1.2, east: 0.9, west: 1.1, central: 1.05 };
      const ageGroupMap = { "18-24": 30, "25-34": 50, "35-44": 60, "45-54": 70, "55+": 80 };

      const purchaseCount = purchaseCountMap[frequency as keyof typeof purchaseCountMap] || 5;
      const avgPrice = spendingMap[spendingTier as keyof typeof spendingMap] || 50;
      const totalQuantity = (ageGroupMap[ageGroup as keyof typeof ageGroupMap] || 50) * (regionMap[region as keyof typeof regionMap] || 1);

      const response = await fetch(`${API_BASE}/api/segments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchase_count: purchaseCount,
          avg_price: avgPrice,
          total_quantity: totalQuantity,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = body?.error ?? "Segmentation failed.";
        throw new Error(message);
      }

      const body = (await response.json()) as any;
      if (body && body.segment !== undefined) {
        setSegmentResult({
          segment_name: body.segment_name || `Segment ${body.segment}`,
          confidence: body.confidence || 0.65,
          segment_profile: {
            size_percent: body.segment_profile?.size_percent || 15,
            avg_purchase_value: body.segment_profile?.avg_purchase_value || 50,
            top_products: body.segment_profile?.top_products || [],
          },
          characteristics: body.characteristics || "Customer segment insights.",
          strategy: body.strategy || "Tailor recommendations based on segment behavior.",
        });
      } else {
        throw new Error(body?.error || "No segment result returned.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Segmentation failed.";
      setSegmentError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyResult = () => {
    if (!segmentResult) return;

    const text = `Segment: ${segmentResult.segment_name}
Confidence: ${(segmentResult.confidence * 100).toFixed(0)}%
Size: ${segmentResult.segment_profile.size_percent.toFixed(1)}% of customers
Avg Purchase: $${segmentResult.segment_profile.avg_purchase_value.toFixed(2)}
Top Products: ${segmentResult.segment_profile.top_products.join(", ")}
Characteristics: ${segmentResult.characteristics}
Recommended Strategy: ${segmentResult.strategy}`;

    navigator.clipboard.writeText(text);
    setCopyFeedback("Copied!");
    setTimeout(() => setCopyFeedback(""), 2000);
  };

  const confidenceRating = useMemo(() => {
    if (!segmentResult) return { label: "", color: "" };
    const conf = segmentResult.confidence;
    if (conf >= 0.75) return { label: "High confidence", color: "green" };
    if (conf >= 0.5) return { label: "Moderate confidence", color: "blue" };
    return { label: "Low confidence", color: "amber" };
  }, [segmentResult]);

  return (
    <div className="page-shell">
      <section className="hero-mini workflow-hero">
        <p className="hero-eyebrow">Customer Intelligence</p>
        <h1>Segment Analyzer</h1>
        <p>Input customer profile attributes and discover which segment they belong to with actionable insights.</p>
        <div className="hero-inline-metrics">
          <span>
            <FiTarget /> Customer Profile Input
          </span>
          <span>
            <FiActivity /> Segment Assignment
          </span>
          <span>
            <FiBarChart /> Strategic Recommendations
          </span>
        </div>
      </section>

      <section className="analyzer-grid analyzer-grid-v2">
        <article className="surface-card analyzer-builder analyzer-builder-v2">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 1 of 2</p>
            <h2>Enter Customer Profile</h2>
            <p>Select attributes that describe the customer you want to analyze.</p>
          </div>

          {!analysis && (
            <article className="sim-card blocked-hint-card">
              <FiInfo className="blocked-hint-icon" />
              <p className="blocked-hint-title">{datasetLoaded ? "Dataset ready, analysis pending" : "No dataset loaded"}</p>
              <p className="blocked-hint-text">
                {datasetLoaded
                  ? "Run analysis in Workspace to unlock segmentation outputs."
                  : "Upload and analyze a dataset in Workspace first to use segmentation."}
              </p>
            </article>
          )}

          <article className="sim-card">
            <p className="sim-card-title">Age Group</p>
            <div className="seg-field-group">
              {["18-24", "25-34", "35-44", "45-54", "55+"].map((group) => (
                <label key={group} className="seg-radio">
                  <input
                    type="radio"
                    name="ageGroup"
                    value={group}
                    checked={ageGroup === group}
                    onChange={(e) => setAgeGroup(e.target.value)}
                  />
                  <span>{group}</span>
                </label>
              ))}
            </div>
          </article>

          <article className="sim-card">
            <p className="sim-card-title">Purchase Frequency</p>
            <div className="seg-field-group">
              {["weekly", "bi-weekly", "monthly", "quarterly", "annually"].map((freq) => (
                <label key={freq} className="seg-radio">
                  <input
                    type="radio"
                    name="frequency"
                    value={freq}
                    checked={frequency === freq}
                    onChange={(e) => setFrequency(e.target.value)}
                  />
                  <span>{freq.charAt(0).toUpperCase() + freq.slice(1)}</span>
                </label>
              ))}
            </div>
          </article>

          <article className="sim-card">
            <p className="sim-card-title">Region</p>
            <div className="seg-field-group">
              {["north", "south", "east", "west", "central"].map((reg) => (
                <label key={reg} className="seg-radio">
                  <input
                    type="radio"
                    name="region"
                    value={reg}
                    checked={region === reg}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                  <span>{reg.charAt(0).toUpperCase() + reg.slice(1)}</span>
                </label>
              ))}
            </div>
          </article>

          <article className="sim-card">
            <p className="sim-card-title">Spending Tier</p>
            <div className="seg-field-group">
              {["low", "medium", "high", "premium"].map((tier) => (
                <label key={tier} className="seg-radio">
                  <input
                    type="radio"
                    name="spendingTier"
                    value={tier}
                    checked={spendingTier === tier}
                    onChange={(e) => setSpendingTier(e.target.value)}
                  />
                  <span>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                </label>
              ))}
            </div>
          </article>

          <div className="profile-actions sim-primary-actions">
            <button className="primary-btn" type="button" onClick={runSegmentation} disabled={isLoading || !analysis}>
              {isLoading ? <FiLoader className="spin" /> : <FiTarget />}
              {isLoading ? "Analyzing..." : "Analyze Segment"}
            </button>
          </div>
        </article>

        <article className="surface-card analyzer-results analyzer-results-v2">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 2 of 2</p>
            <h2>Segment Results</h2>
            <p>Customer profile and strategic recommendations.</p>
          </div>

          {!hasRequested && (
            <article className="sim-empty-state">
              <FiTarget />
              <h3>Ready to analyze?</h3>
              <p>Enter customer attributes and click Analyze Segment to discover which segment they belong to.</p>
            </article>
          )}

          {hasRequested && isLoading && (
            <article className="sim-empty-state">
              <FiLoader className="spin" />
              <h3>Analyzing customer profile...</h3>
            </article>
          )}

          {hasRequested && !isLoading && segmentError && (
            <article className="sim-error-state">
              <h3>
                <FiX /> Error
              </h3>
              <p>{segmentError}</p>
            </article>
          )}

          {hasRequested && !isLoading && !segmentError && segmentResult && (
            <div className="seg-results-grid">
              <article className="seg-result-header">
                <h2>{segmentResult.segment_name}</h2>
                <div className="seg-badges">
                  <span className={`seg-badge seg-badge-${confidenceRating.color}`}>
                    {confidenceRating.label}
                  </span>
                  <span className="seg-badge seg-badge-info">{(segmentResult.confidence * 100).toFixed(0)}% match</span>
                </div>
              </article>

              <article className="seg-card">
                <p className="seg-card-label">Segment Size</p>
                <p className="seg-card-value">{segmentResult.segment_profile.size_percent.toFixed(1)}%</p>
                <p className="seg-card-hint">of total customer base</p>
              </article>

              <article className="seg-card">
                <p className="seg-card-label">Avg Purchase Value</p>
                <p className="seg-card-value">${segmentResult.segment_profile.avg_purchase_value.toFixed(2)}</p>
                <p className="seg-card-hint">per transaction</p>
              </article>

              <article className="seg-card">
                <p className="seg-card-label">Top Products</p>
                <div className="seg-product-list">
                  {segmentResult.segment_profile.top_products.map((product) => (
                    <span key={product} className="seg-product-chip">
                      {product}
                    </span>
                  ))}
                </div>
              </article>

              <article className="seg-info-block">
                <p className="seg-info-title">Segment Characteristics</p>
                <p className="seg-info-text">{segmentResult.characteristics}</p>
              </article>

              <article className="seg-info-block seg-info-block-strategy">
                <p className="seg-info-title">Recommended Strategy</p>
                <p className="seg-info-text">{segmentResult.strategy}</p>
              </article>

              <div className="seg-actions">
                <button className="seg-action-btn" onClick={copyResult}>
                  <FiCopy /> {copyFeedback || "Copy Result"}
                </button>
                <button className="seg-action-btn">
                  <FiDownload /> Export as CSV
                </button>
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default Segmentation;
