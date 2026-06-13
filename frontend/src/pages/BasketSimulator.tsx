import { useMemo, useState } from "react";
import { API_BASE } from "../utils/api";
import {
  FiActivity,
  FiFilter,
  FiLoader,
  FiPlay,
  FiPlus,
  FiSearch,
  FiShoppingBag,
  FiTarget,
  FiTrendingUp,
  FiX,
} from "react-icons/fi";
import type { AnalysisResult, MiningAlgorithm, Recommendation } from "../types";

type BasketSimulatorProps = {
  analysis: AnalysisResult | null;
  activeFileName: string;
  analyzedAt: string | null;
};

type GoalKey = "boost_aov" | "increase_attach" | "clear_stock";

const MAX_VISIBLE_PRODUCTS = 120;
const MIN_SEARCH_LENGTH = 2;
const QUICK_PICK_LIMIT = 12;

const GOALS: Array<{ key: GoalKey; label: string; helper: string; short: string }> = [
  {
    key: "boost_aov",
    label: "Increase basket value",
    helper: "Prioritize products likely to increase total basket spend.",
    short: "AOV",
  },
  {
    key: "increase_attach",
    label: "Increase add-on purchases",
    helper: "Focus on products often bought together to improve attach rate.",
    short: "Attach",
  },
  {
    key: "clear_stock",
    label: "Move slower inventory",
    helper: "Favor practical pairings that can help move long-tail stock.",
    short: "Clear",
  },
];

function splitRuleItems(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function BasketSimulator({ analysis, activeFileName, analyzedAt }: BasketSimulatorProps) {
  const [query, setQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [topN, setTopN] = useState(5);
  const [algorithm, setAlgorithm] = useState<MiningAlgorithm>("fpgrowth");
  const [goal, setGoal] = useState<GoalKey>("increase_attach");
  const [showCatalog, setShowCatalog] = useState(false);

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [hasRequested, setHasRequested] = useState(false);

  const allProducts = useMemo(() => {
    if (!analysis) {
      return [] as string[];
    }

    const derived = new Set<string>();

    (analysis.productCatalog ?? []).forEach((item) => {
      const clean = item.trim();
      if (clean.length > 0) {
        derived.add(clean);
      }
    });

    analysis.itemFrequency.forEach((item) => {
      derived.add(item.item);
    });

    analysis.rules.forEach((rule) => {
      splitRuleItems(rule.antecedent).forEach((item) => derived.add(item));
      splitRuleItems(rule.consequent).forEach((item) => derived.add(item));
    });

    return Array.from(derived).sort((a, b) => a.localeCompare(b));
  }, [analysis]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < MIN_SEARCH_LENGTH) {
      return [] as string[];
    }

    const base = allProducts.filter((item) => !selectedItems.includes(item));
    return base
      .filter((item) => item.toLowerCase().includes(needle))
      .slice(0, MAX_VISIBLE_PRODUCTS);
  }, [allProducts, query, selectedItems]);

  const popularProducts = useMemo(() => {
    if (!analysis) {
      return [] as string[];
    }

    return analysis.itemFrequency
      .map((entry) => entry.item)
      .filter((item) => !selectedItems.includes(item))
      .slice(0, QUICK_PICK_LIMIT);
  }, [analysis, selectedItems]);

  const starterTemplates = useMemo(() => {
    const source =
      analysis && analysis.itemFrequency.length > 0
        ? analysis.itemFrequency.map((item) => item.item)
        : allProducts;

    const uniqueSource = Array.from(new Set(source));
    if (uniqueSource.length === 0) {
      return [] as Array<{ name: string; items: string[] }>;
    }

    const templates = [
      {
        name: "Quick Starter",
        items: uniqueSource.slice(0, 2),
      },
      {
        name: "Cross-Sell Starter",
        items: uniqueSource.slice(1, 4),
      },
      {
        name: "Bundle Trial",
        items: [uniqueSource[0], uniqueSource[3], uniqueSource[5]].filter((value): value is string => Boolean(value)),
      },
    ];

    return templates.filter((template) => template.items.length > 0);
  }, [allProducts, analysis]);

  const goalMeta = GOALS.find((item) => item.key === goal) ?? GOALS[0];

  const getStrengthBadge = (recommendation: Recommendation) => {
    if (recommendation.confidence >= 0.35 && recommendation.lift >= 2) {
      return { label: "Strong match", tone: "strong" as const };
    }
    if (recommendation.confidence >= 0.2 && recommendation.lift >= 1.2) {
      return { label: "Good match", tone: "good" as const };
    }
    return { label: "Test carefully", tone: "caution" as const };
  };

  const getPlainLanguageReason = (recommendation: Recommendation) => {
    if (goal === "boost_aov") {
      return `${recommendation.product} is often purchased with your basket and can help raise order value.`;
    }
    if (goal === "clear_stock") {
      return `${recommendation.product} has practical co-buy behavior with your basket and is suitable for stock movement campaigns.`;
    }
    return `${recommendation.product} is commonly bought alongside your selected products and is a good add-on candidate.`;
  };

  const toggleItem = (item: string) => {
    setSelectedItems((prev) => (prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item]));
    setHasRequested(false);
    setRecommendations([]);
    setSimulateError("");
  };

  const scoreRecommendation = (recommendation: Recommendation) => {
    if (goal === "boost_aov") {
      return recommendation.lift * recommendation.confidence;
    }
    if (goal === "clear_stock") {
      return recommendation.support * (recommendation.lift + recommendation.confidence);
    }
    return recommendation.confidence;
  };

  const rankedRecommendations = useMemo(
    () =>
      [...recommendations].sort((a, b) => {
        const scoreA = scoreRecommendation(a);
        const scoreB = scoreRecommendation(b);
        return scoreB - scoreA;
      }),
    [recommendations, goal],
  );

  const recommendationSummary = useMemo(() => {
    if (rankedRecommendations.length === 0) {
      return null;
    }

    const avgConfidence =
      rankedRecommendations.reduce((accumulator, current) => accumulator + current.confidence, 0) / rankedRecommendations.length;
    const avgLift = rankedRecommendations.reduce((accumulator, current) => accumulator + current.lift, 0) / rankedRecommendations.length;
    const topMatch = rankedRecommendations[0]?.product ?? "-";

    return {
      avgConfidence,
      avgLift,
      topMatch,
    };
  }, [rankedRecommendations]);

  const formatAnalyzedAt = (value: string | null) => {
    if (!value) {
      return "Just now";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Just now";
    }

    return date.toLocaleString();
  };

  const runSimulation = async () => {
    if (!analysis) {
      setSimulateError(
        activeFileName
          ? "Dataset uploaded, but analysis is not complete yet. Run analysis in Workspace first."
          : "Upload and analyze a dataset in Workspace first.",
      );
      setRecommendations([]);
      setHasRequested(true);
      return;
    }

    if (selectedItems.length === 0) {
      setSimulateError("Add at least one basket item before running simulation.");
      setRecommendations([]);
      setHasRequested(true);
      return;
    }

    setIsSimulating(true);
    setHasRequested(true);
    setSimulateError("");
    setRecommendations([]);

    try {
      const response = await fetch(`${API_BASE}/api/recommendations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: selectedItems,
          algorithm,
          top_n: topN,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = body?.error ?? "Recommendation simulation failed.";
        throw new Error(message);
      }

      const body = (await response.json()) as { recommendations?: Recommendation[] };
      setRecommendations(Array.isArray(body.recommendations) ? body.recommendations : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recommendation simulation failed.";
      setSimulateError(message);
    } finally {
      setIsSimulating(false);
    }
  };

  const clearBasket = () => {
    setSelectedItems([]);
    setQuery("");
    setHasRequested(false);
    setRecommendations([]);
    setSimulateError("");
  };

  const catalogPreview = useMemo(
    () => allProducts.filter((item) => !selectedItems.includes(item)).slice(0, MAX_VISIBLE_PRODUCTS),
    [allProducts, selectedItems],
  );

  const applyTemplate = (items: string[]) => {
    setSelectedItems(items);
    setHasRequested(false);
    setRecommendations([]);
    setSimulateError("");
  };

  return (
    <div className="page-shell simulator-shell simulator-shell-v2">
      <section className="hero-mini workflow-hero simulator-hero simulator-hero-v2">
        <p className="hero-eyebrow">Basket Simulator</p>
        <h1>Scenario Design Studio</h1>
        <p>
          Build one basket scenario, run recommendation experiments, and compare what-if outcomes.
        </p>
        <div className="hero-inline-metrics">
          <span>
            <FiShoppingBag /> Guided Basket Setup
          </span>
          <span>
            <FiPlay /> One-Click Simulation
          </span>
          <span>
            <FiTarget /> Actionable Outcome Cards
          </span>
        </div>
        <p className="sim-results-context" style={{ marginTop: "0.8rem" }}>
          Scenario mode: this page is for recommendation experiments, not likelihood scoring.
        </p>
      </section>

      <section className="simulator-grid simulator-grid-v2">
        <article className="surface-card simulator-builder simulator-builder-v2">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 1 of 2</p>
            <h2>Build Your Basket</h2>
            <p>Choose your goal, add products, run simulation.</p>
          </div>

          <article className="sim-card sim-dataset-card">
            <p className="sim-card-title">Active Dataset</p>
            {analysis ? (
              <>
                <div className="sim-card-row">
                  <span className="sim-card-label">File:</span>
                  <strong>{activeFileName || "Uploaded CSV"}</strong>
                </div>
                <div className="sim-card-row">
                  <span className="sim-card-label">Analyzed:</span>
                  <strong>{formatAnalyzedAt(analyzedAt)}</strong>
                </div>
                <div className="sim-dataset-stats">
                  <span>{analysis.totalTransactions} transactions</span>
                  <span>{analysis.rules.length} rules</span>
                  <span>{allProducts.length} products</span>
                </div>
              </>
            ) : (
              <p className="muted-text">
                {activeFileName
                  ? "Dataset uploaded, but analysis has not run yet. Open Workspace and run analysis."
                  : "No dataset loaded. Upload and analyze in Workspace first."}
              </p>
            )}
          </article>

          <article className="sim-card sim-goal-card">
            <p className="sim-card-title">Choose Your Goal</p>
            <div className="sim-goal-grid">
              {GOALS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`sim-goal-chip ${goal === item.key ? "active" : ""}`}
                  onClick={() => setGoal(item.key)}
                >
                  <span>{item.short}</span>
                  {item.label}
                </button>
              ))}
            </div>
            <p className="sim-goal-helper">{goalMeta.helper}</p>
          </article>

          <article className="sim-card">
            <p className="sim-card-title">Your Basket ({selectedItems.length})</p>
            <div className="selected-basket selected-basket-v2">
              {selectedItems.length === 0 ? (
                <p className="muted-text">No items yet. Add products below to start.</p>
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

            {starterTemplates.length > 0 && (
              <div className="sim-quick-section">
                <p className="sim-subsection-title">Quick Templates</p>
                <div className="starter-template-row">
                  {starterTemplates.map((template) => (
                    <button key={template.name} type="button" className="starter-template-chip" onClick={() => applyTemplate(template.items)}>
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="sim-search-section">
              <p className="sim-subsection-title">Search Catalog</p>
              <label className="rule-search-input simulator-search" htmlFor="sim-product-search">
                <FiSearch />
                <input
                  id="sim-product-search"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Type product name..."
                  disabled={!analysis}
                />
              </label>

              <div className="product-pool product-pool-v2">
                {!analysis && <p className="muted-text">No products available yet.</p>}
                {analysis && query.trim().length < MIN_SEARCH_LENGTH && (
                  <p className="muted-text">Type at least {MIN_SEARCH_LENGTH} characters to search.</p>
                )}
                {analysis && query.trim().length >= MIN_SEARCH_LENGTH && filteredProducts.length === 0 && (
                  <p className="muted-text">No products found. Try different keywords.</p>
                )}
                {analysis &&
                  filteredProducts.map((item) => (
                    <button key={item} type="button" className="product-pill" onClick={() => toggleItem(item)}>
                      <FiPlus /> {item}
                    </button>
                  ))}

                {analysis && (
                  <button type="button" className="sim-catalog-toggle" onClick={() => setShowCatalog((prev) => !prev)}>
                    {showCatalog ? "Hide full catalog" : "Show full catalog"}
                  </button>
                )}

                {analysis && showCatalog && (
                  <div className="sim-catalog-list">
                    {catalogPreview.map((item) => (
                      <button key={`catalog-${item}`} type="button" className="product-pill" onClick={() => toggleItem(item)}>
                        <FiPlus /> {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>

          <details className="sim-advanced">
            <summary>
              <FiFilter /> Advanced settings
            </summary>
            <div className="simulator-controls">
              <label>
                Algorithm
                <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as MiningAlgorithm)}>
                  <option value="fpgrowth">FP-Growth</option>
                  <option value="apriori">Apriori</option>
                </select>
              </label>
              <label>
                Suggestions to show
                <select value={topN} onChange={(event) => setTopN(Number(event.target.value))}>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
            </div>
            <p className="muted-text">If unsure, keep defaults. Suggestions are based on your analyzed dataset.</p>
          </details>

          <div className="profile-actions sim-primary-actions">
            <button className="primary-btn" type="button" onClick={runSimulation} disabled={isSimulating || !analysis}>
              {isSimulating ? <FiLoader className="spin" /> : <FiPlay />}
              {isSimulating ? "Simulating..." : "Run Simulation"}
            </button>
            <button className="ghost-btn" type="button" onClick={clearBasket}>
              <FiX /> Clear All
            </button>
          </div>
        </article>

        <article className="surface-card simulator-results simulator-results-v2">
          <div className="stage-head stage-head-slim">
            <p className="stage-kicker">Step 2 of 2</p>
            <h2>Scenario Recommendations</h2>
            <p>Ranked suggestions for this what-if basket scenario.</p>
          </div>

          {analysis && (
            <p className="sim-results-context">
              Goal: <strong>{goalMeta.label}</strong> • Basket: <strong>{selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""}</strong> • Showing: <strong>Top {topN}</strong>
            </p>
          )}

          {!hasRequested && (
            <article className="sim-empty-state">
              <FiPlay />
              <h3>Ready to simulate?</h3>
              <p>Add basket items on the left and click Run Simulation to see recommendations.</p>
            </article>
          )}

          {hasRequested && isSimulating && (
            <article className="sim-empty-state">
              <FiLoader className="spin" />
              <h3>Running simulation...</h3>
              <p>Analyzing co-purchase patterns for your basket.</p>
            </article>
          )}

          {hasRequested && !isSimulating && simulateError && (
            <article className="sim-error-state">
              <h3>
                <FiX /> Error
              </h3>
              <p>{simulateError}</p>
              <p className="muted-text">Try different products or adjust your basket.</p>
            </article>
          )}

          {hasRequested && !isSimulating && !simulateError && recommendations.length === 0 && (
            <article className="sim-empty-state">
              <h3>No recommendations</h3>
              <p>Try using high-frequency products or switching business objectives.</p>
            </article>
          )}

          {hasRequested && !isSimulating && !simulateError && rankedRecommendations.length > 0 && (
            <div className="sim-results-grid">
              {recommendationSummary && (
                <article className="sim-results-summary">
                  <p><FiTrendingUp /> <span>Avg Confidence</span> <strong>{(recommendationSummary.avgConfidence * 100).toFixed(0)}%</strong></p>
                  <p><FiActivity /> <span>Avg Lift</span> <strong>{recommendationSummary.avgLift.toFixed(2)}x</strong></p>
                  <p><FiTarget /> <span>Top Match</span> <strong>{recommendationSummary.topMatch}</strong></p>
                </article>
              )}

              {rankedRecommendations.map((rec, index) => (
                <article key={`${rec.product}-${index}`} className="sim-rec-card">
                  <div className="sim-rec-header">
                    <div>
                      <span className="sim-rec-rank">#{index + 1}</span>
                      <h3>{rec.product}</h3>
                    </div>
                    <span className={`sim-rec-badge ${getStrengthBadge(rec).tone}`}>
                      {getStrengthBadge(rec).label}
                    </span>
                  </div>

                  <p className="sim-rec-reason">{getPlainLanguageReason(rec)}</p>

                  <div className="sim-rec-metrics">
                    <div className="sim-metric">
                      <span>Confidence</span>
                      <strong>{(rec.confidence * 100).toFixed(0)}%</strong>
                      <div className="sim-confidence-track">
                        <span style={{ width: `${Math.max(4, Math.min(100, rec.confidence * 100))}%` }} />
                      </div>
                    </div>
                    <div className="sim-metric">
                      <span>Lift</span>
                      <strong>{rec.lift.toFixed(2)}x</strong>
                    </div>
                    <div className="sim-metric">
                      <span>Support</span>
                      <strong>{(rec.support * 100).toFixed(1)}%</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="sim-rec-action"
                    onClick={() => toggleItem(rec.product)}
                    disabled={selectedItems.includes(rec.product)}
                  >
                    {selectedItems.includes(rec.product) ? "✓ In basket" : "Add to basket"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default BasketSimulator;
