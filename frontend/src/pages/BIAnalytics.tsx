import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiFilter,
  FiGrid,
  FiLayers,
  FiList,
  FiPieChart,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiSliders,
  FiTrendingUp,
} from "react-icons/fi";
import type {
  AnalysisResult,
  BIOverviewResponse,
  BIProductDetailResponse,
  BIProductRow,
  BITransactionRow,
} from "../types";
import { API_BASE } from "../utils/api";

type BIAnalyticsProps = {
  analysis: AnalysisResult | null;
  datasetLoaded: boolean;
};

type BIWorkspaceView = "report" | "data" | "model";
type BIReportPage = "executive" | "products" | "associations";
type BIVisualType = "line" | "bar";
type BIMetric = "orders" | "sales" | "aov";

type TrendPoint = {
  period: string;
  orders: number;
  sales: number;
  aov: number;
};

type CountrySummary = {
  country: string;
  orders: number;
  sales: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizePeriod(datetimeValue: string | null): string | null {
  if (!datetimeValue) {
    return null;
  }

  const parsed = new Date(datetimeValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}`;
}

function BIAnalytics({ analysis, datasetLoaded }: BIAnalyticsProps) {
  const [workspaceView, setWorkspaceView] = useState<BIWorkspaceView>("report");
  const [reportPage, setReportPage] = useState<BIReportPage>("executive");
  const [visualType, setVisualType] = useState<BIVisualType>("line");
  const [metric, setMetric] = useState<BIMetric>("orders");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<BIOverviewResponse | null>(null);

  const [countryFilter, setCountryFilter] = useState("All");
  const [productSearch, setProductSearch] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [minLift, setMinLift] = useState(1);

  const [selectedProduct, setSelectedProduct] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<BIProductDetailResponse["product"] | null>(null);

  const [dataPage, setDataPage] = useState(1);
  const dataPageSize = 25;

  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([
    "Orders.Total Orders",
    "Orders.Total Sales",
    "Orders.Average Order Value",
    "Orders.Period",
  ]);

  const fetchOverview = async () => {
    if (!datasetLoaded || !analysis) {
      setOverview(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/bi/overview`);
      const body = (await response.json().catch(() => null)) as BIOverviewResponse | null;

      if (!response.ok || !body || !body.ready) {
        throw new Error(body?.error ?? "BI data could not be loaded.");
      }

      setOverview(body);
    } catch (err) {
      setOverview(null);
      setError(err instanceof Error ? err.message : "Failed to load BI dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview();
  }, [datasetLoaded, analysis]);

  const products = overview?.products ?? [];
  const transactions = overview?.transactions ?? [];
  const rules = overview?.rules ?? [];

  useEffect(() => {
    if (products.length === 0) {
      setSelectedProduct("");
      return;
    }

    const stillValid = products.some((entry) => entry.name === selectedProduct);
    if (!stillValid) {
      setSelectedProduct(products[0].name);
    }
  }, [products, selectedProduct]);

  useEffect(() => {
    const loadProductDetail = async () => {
      if (!selectedProduct || !overview?.ready) {
        setDetail(null);
        setDetailError("");
        return;
      }

      setDetailLoading(true);
      setDetailError("");

      try {
        const response = await fetch(
          `${API_BASE}/api/bi/product-detail?product=${encodeURIComponent(selectedProduct)}`,
        );
        const body = (await response.json().catch(() => null)) as BIProductDetailResponse | null;

        if (!response.ok || !body || !body.ready || !body.product) {
          throw new Error(body?.error ?? "Product detail unavailable.");
        }

        setDetail(body.product);
      } catch (err) {
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "Failed to load product details.");
      } finally {
        setDetailLoading(false);
      }
    };

    void loadProductDetail();
  }, [selectedProduct, overview?.ready]);

  const countries = useMemo(() => {
    const unique = Array.from(new Set(transactions.map((row) => row.country).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return ["All", ...unique];
  }, [transactions]);

  const transactionsByCountry = useMemo(() => {
    if (countryFilter === "All") {
      return transactions;
    }
    return transactions.filter((row) => row.country === countryFilter);
  }, [countryFilter, transactions]);

  const filteredTransactions = useMemo(() => {
    const needle = transactionSearch.trim().toLowerCase();
    if (!needle) {
      return transactionsByCountry;
    }

    return transactionsByCountry.filter((row) => {
      const haystack = `${row.invoice} ${row.country} ${row.items.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [transactionSearch, transactionsByCountry]);

  const executiveKpis = useMemo(() => {
    const totalOrders = transactionsByCountry.length;
    const totalSales = transactionsByCountry.reduce((sum, row) => sum + row.totalValue, 0);
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const productsPerOrder =
      totalOrders > 0
        ? transactionsByCountry.reduce((sum, row) => sum + row.itemCount, 0) / totalOrders
        : 0;

    const countryMap = new Map<string, { orders: number; sales: number }>();
    transactionsByCountry.forEach((row) => {
      const current = countryMap.get(row.country) ?? { orders: 0, sales: 0 };
      current.orders += 1;
      current.sales += row.totalValue;
      countryMap.set(row.country, current);
    });

    const topCountry = [...countryMap.entries()]
      .sort((a, b) => b[1].orders - a[1].orders)
      .map(([country]) => country)[0] ?? "N/A";

    const strongLinks = rules.filter((rule) => rule.lift >= Math.max(1, minLift)).length;

    return {
      totalOrders,
      totalSales,
      avgOrderValue,
      productsPerOrder,
      topCountry,
      strongLinks,
    };
  }, [minLift, rules, transactionsByCountry]);

  const trendData = useMemo<TrendPoint[]>(() => {
    const source = transactionsByCountry;
    if (source.length === 0) {
      return [];
    }

    const periodMap = new Map<string, { orders: number; sales: number }>();
    source.forEach((row) => {
      const period = normalizePeriod(row.datetime) ?? "Unknown";
      const current = periodMap.get(period) ?? { orders: 0, sales: 0 };
      current.orders += 1;
      current.sales += row.totalValue;
      periodMap.set(period, current);
    });

    return [...periodMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, entry]) => ({
        period,
        orders: entry.orders,
        sales: entry.sales,
        aov: entry.orders > 0 ? entry.sales / entry.orders : 0,
      }));
  }, [transactionsByCountry]);

  const finalTrendData = useMemo<TrendPoint[]>(() => {
    if (trendData.length > 0) {
      return trendData;
    }

    const fallback = overview?.trends?.transactions ?? [];
    return fallback.map((row) => ({
      period: row.period,
      orders: row.transactions,
      sales: row.revenue,
      aov: row.avgBasketValue,
    }));
  }, [overview?.trends?.transactions, trendData]);

  const countryChart = useMemo<CountrySummary[]>(() => {
    const map = new Map<string, CountrySummary>();
    transactionsByCountry.forEach((row) => {
      const current = map.get(row.country) ?? { country: row.country, orders: 0, sales: 0 };
      current.orders += 1;
      current.sales += row.totalValue;
      map.set(row.country, current);
    });

    return [...map.values()].sort((a, b) => b.orders - a.orders).slice(0, 8);
  }, [transactionsByCountry]);

  const filteredProducts = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    if (!needle) {
      return products;
    }
    return products.filter((row) => row.name.toLowerCase().includes(needle));
  }, [productSearch, products]);

  const productTopChart = useMemo(() => filteredProducts.slice(0, 10), [filteredProducts]);

  const filteredRules = useMemo(() => {
    const needle = ruleSearch.trim().toLowerCase();
    return rules.filter((rule) => {
      const meetsLift = rule.lift >= minLift;
      if (!meetsLift) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const text = `${rule.antecedent} ${rule.consequent}`.toLowerCase();
      return text.includes(needle);
    });
  }, [minLift, ruleSearch, rules]);

  const totalDataPages = Math.max(1, Math.ceil(filteredTransactions.length / dataPageSize));

  useEffect(() => {
    setDataPage(1);
  }, [countryFilter, transactionSearch]);

  useEffect(() => {
    setDataPage((prev) => Math.min(prev, totalDataPages));
  }, [totalDataPages]);

  const pagedTransactions = useMemo(() => {
    const start = (dataPage - 1) * dataPageSize;
    return filteredTransactions.slice(start, start + dataPageSize);
  }, [dataPage, filteredTransactions]);

  const fieldCatalog = useMemo(
    () => [
      {
        table: "Orders",
        fields: [
          "Orders.Order ID",
          "Orders.Country",
          "Orders.Period",
          "Orders.Total Orders",
          "Orders.Total Sales",
          "Orders.Average Order Value",
        ],
      },
      {
        table: "Products",
        fields: [
          "Products.Product",
          "Products.Orders",
          "Products.Units Sold",
          "Products.Sales",
          "Products.Average Price",
        ],
      },
      {
        table: "Associations",
        fields: [
          "Associations.Antecedent",
          "Associations.Consequent",
          "Associations.Support",
          "Associations.Confidence",
          "Associations.Lift",
        ],
      },
    ],
    [],
  );

  const visibleFieldCatalog = useMemo(() => {
    const needle = fieldSearch.trim().toLowerCase();
    if (!needle) {
      return fieldCatalog;
    }

    return fieldCatalog
      .map((group) => ({
        ...group,
        fields: group.fields.filter((field) => field.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.fields.length > 0 || group.table.toLowerCase().includes(needle));
  }, [fieldCatalog, fieldSearch]);

  const toggleField = (fieldKey: string) => {
    setSelectedFieldKeys((current) => {
      if (current.includes(fieldKey)) {
        return current.filter((entry) => entry !== fieldKey);
      }
      return [...current, fieldKey];
    });
  };

  const availableMetrics = useMemo(() => {
    const options: BIMetric[] = [];
    if (selectedFieldKeys.includes("Orders.Total Orders")) {
      options.push("orders");
    }
    if (selectedFieldKeys.includes("Orders.Total Sales")) {
      options.push("sales");
    }
    if (selectedFieldKeys.includes("Orders.Average Order Value")) {
      options.push("aov");
    }
    return options.length > 0 ? options : (["orders", "sales", "aov"] as BIMetric[]);
  }, [selectedFieldKeys]);

  useEffect(() => {
    if (!availableMetrics.includes(metric)) {
      setMetric(availableMetrics[0]);
    }
  }, [availableMetrics, metric]);

  const metricConfig = useMemo(() => {
    if (metric === "orders") {
      return {
        dataKey: "orders" as const,
        title: "Orders Trend",
        color: "#2563eb",
        label: "Orders",
        formatter: (value: number) => value.toLocaleString(),
      };
    }

    if (metric === "sales") {
      return {
        dataKey: "sales" as const,
        title: "Sales Trend",
        color: "#4f46e5",
        label: "Sales",
        formatter: (value: number) => formatCurrency(value),
      };
    }

    return {
      dataKey: "aov" as const,
      title: "Average Order Value Trend",
      color: "#0ea5e9",
      label: "Average Order Value",
      formatter: (value: number) => formatCurrency(value),
    };
  }, [metric]);

  const selectedProductSummary = useMemo(() => {
    if (!selectedProduct) {
      return null;
    }
    return products.find((entry) => entry.name === selectedProduct) ?? null;
  }, [products, selectedProduct]);

  if (!datasetLoaded) {
    return (
      <div className="page-shell">
        <section className="hero-mini workflow-hero">
          <p className="hero-eyebrow">BI Analytics</p>
          <h1>BI unlocks after dataset upload</h1>
          <p>Upload and analyze your dataset in Workspace first to open BI Desktop style views.</p>
        </section>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="page-shell">
        <section className="hero-mini workflow-hero">
          <p className="hero-eyebrow">BI Analytics</p>
          <h1>Run analysis to unlock BI workspace</h1>
          <p>Your dataset is uploaded. Run analysis in Workspace to create report, data, and model views.</p>
        </section>

        <section className="surface-card empty-card">
          <h3>Analysis required</h3>
          <p>Open Workspace and run analysis once, then return here for the final BI interface.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <section className="hero-mini workflow-hero">
        <p className="hero-eyebrow">Power BI Style Workspace</p>
        <h1>Professional BI Desktop Interface</h1>
        <p>Ribbon, report canvas, data grid, model view, fields, and visual settings are fully interactive.</p>
      </section>

      <section className="surface-card pb-ribbon">
        <div className="pb-ribbon-group">
          <p>Workspace</p>
          <div className="pb-chip-row" role="tablist" aria-label="Workspace view">
            <button
              type="button"
              className={`scope-chip ${workspaceView === "report" ? "active" : ""}`}
              onClick={() => setWorkspaceView("report")}
            >
              <FiBarChart2 /> Report
            </button>
            <button
              type="button"
              className={`scope-chip ${workspaceView === "data" ? "active" : ""}`}
              onClick={() => setWorkspaceView("data")}
            >
              <FiGrid /> Data
            </button>
            <button
              type="button"
              className={`scope-chip ${workspaceView === "model" ? "active" : ""}`}
              onClick={() => setWorkspaceView("model")}
            >
              <FiLayers /> Model
            </button>
          </div>
        </div>

        <div className="pb-ribbon-group">
          <p>Report Pages</p>
          <div className="pb-page-tabs" role="tablist" aria-label="Report pages">
            <button
              type="button"
              className={`pb-page-tab ${reportPage === "executive" ? "active" : ""}`}
              onClick={() => setReportPage("executive")}
              disabled={workspaceView !== "report"}
            >
              Executive
            </button>
            <button
              type="button"
              className={`pb-page-tab ${reportPage === "products" ? "active" : ""}`}
              onClick={() => setReportPage("products")}
              disabled={workspaceView !== "report"}
            >
              Products
            </button>
            <button
              type="button"
              className={`pb-page-tab ${reportPage === "associations" ? "active" : ""}`}
              onClick={() => setReportPage("associations")}
              disabled={workspaceView !== "report"}
            >
              Associations
            </button>
          </div>
        </div>

        <div className="pb-ribbon-group">
          <p>Actions</p>
          <button type="button" className="ghost-btn" onClick={() => void fetchOverview()} disabled={loading}>
            <FiRefreshCw className={loading ? "spin" : ""} /> Refresh Data
          </button>
        </div>
      </section>

      {error && (
        <section className="surface-card suitability-banner warning" role="alert">
          <h3>
            <FiAlertTriangle /> BI data unavailable
          </h3>
          <p>{error}</p>
        </section>
      )}

      {loading && !overview ? (
        <section className="surface-card empty-card">
          <h3>Loading BI workspace</h3>
          <p>Preparing report, data, and model views from your active dataset.</p>
        </section>
      ) : null}

      {overview?.ready && (
        <section className="pb-desktop-shell">
          <aside className="surface-card pb-fields-pane">
            <div className="pb-pane-header">
              <h3>Fields</h3>
              <span>{selectedFieldKeys.length} selected</span>
            </div>

            <label className="rule-search-input" htmlFor="field-search">
              <FiSearch />
              <input
                id="field-search"
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="Search fields"
              />
            </label>

            <div className="pb-field-tree">
              {visibleFieldCatalog.map((group) => (
                <details key={group.table} open className="pb-field-group">
                  <summary>
                    <FiList /> {group.table}
                  </summary>
                  <ul>
                    {group.fields.map((fieldKey) => (
                      <li key={fieldKey}>
                        <input
                          type="checkbox"
                          checked={selectedFieldKeys.includes(fieldKey)}
                          onChange={() => toggleField(fieldKey)}
                        />
                        <span>{fieldKey.split(".")[1]}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </aside>

          <main className="surface-card pb-report-canvas">
            {workspaceView === "report" && (
              <>
                <div className="pb-pane-header">
                  <h3>Report Canvas</h3>
                  <span>
                    {reportPage === "executive"
                      ? "Executive page"
                      : reportPage === "products"
                        ? "Products page"
                        : "Associations page"}
                  </span>
                </div>

                <section className="pb-filter-bar">
                  <div className="pb-filter-item">
                    <label htmlFor="country-filter">
                      <FiFilter /> Country Filter
                    </label>
                    <select
                      id="country-filter"
                      value={countryFilter}
                      onChange={(event) => setCountryFilter(event.target.value)}
                    >
                      {countries.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>

                  {reportPage === "products" && (
                    <div className="pb-filter-item">
                      <label htmlFor="product-filter">
                        <FiSearch /> Product Search
                      </label>
                      <input
                        id="product-filter"
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                        placeholder="Search product"
                      />
                    </div>
                  )}

                  {reportPage === "associations" && (
                    <>
                      <div className="pb-filter-item">
                        <label htmlFor="rule-search">
                          <FiSearch /> Rule Search
                        </label>
                        <input
                          id="rule-search"
                          value={ruleSearch}
                          onChange={(event) => setRuleSearch(event.target.value)}
                          placeholder="Search antecedent or consequent"
                        />
                      </div>

                      <div className="pb-filter-item">
                        <label htmlFor="min-lift">Minimum Lift ({minLift.toFixed(1)})</label>
                        <input
                          id="min-lift"
                          type="range"
                          min={1}
                          max={4}
                          step={0.1}
                          value={minLift}
                          onChange={(event) => setMinLift(Number(event.target.value))}
                        />
                      </div>
                    </>
                  )}
                </section>

                {reportPage === "executive" && (
                  <>
                    <section className="kpi-grid">
                      <article className="kpi-card">
                        <p>Total Orders</p>
                        <h3>{executiveKpis.totalOrders.toLocaleString()}</h3>
                      </article>
                      <article className="kpi-card">
                        <p>Total Sales</p>
                        <h3>{formatCurrency(executiveKpis.totalSales)}</h3>
                      </article>
                      <article className="kpi-card">
                        <p>Average Order Value</p>
                        <h3>{formatCurrency(executiveKpis.avgOrderValue)}</h3>
                      </article>
                      <article className="kpi-card">
                        <p>Products per Order</p>
                        <h3>{executiveKpis.productsPerOrder.toFixed(2)}</h3>
                      </article>
                      <article className="kpi-card">
                        <p>Strong Product Links</p>
                        <h3>{executiveKpis.strongLinks.toLocaleString()}</h3>
                      </article>
                      <article className="kpi-card">
                        <p>Main Market</p>
                        <h3>{executiveKpis.topCountry}</h3>
                      </article>
                    </section>

                    <section className="reports-grid">
                      <article className="surface-card reports-span-two">
                        <h2>{metricConfig.title}</h2>
                        <ResponsiveContainer width="100%" height={280}>
                          {visualType === "line" ? (
                            <LineChart data={finalTrendData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="period" />
                              <YAxis />
                              <Tooltip formatter={(value) => [metricConfig.formatter(Number(value)), metricConfig.label]} />
                              <Line
                                type="monotone"
                                dataKey={metricConfig.dataKey}
                                stroke={metricConfig.color}
                                strokeWidth={2.4}
                                dot={{ r: 2 }}
                              />
                            </LineChart>
                          ) : (
                            <BarChart data={finalTrendData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="period" />
                              <YAxis />
                              <Tooltip formatter={(value) => [metricConfig.formatter(Number(value)), metricConfig.label]} />
                              <Bar dataKey={metricConfig.dataKey} fill={metricConfig.color} radius={[8, 8, 0, 0]} />
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </article>

                      <article className="surface-card reports-span-two">
                        <h2>Country Comparison by Orders</h2>
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={countryChart}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="country" />
                            <YAxis />
                            <Tooltip formatter={(value) => [Number(value).toLocaleString(), "Orders"]} />
                            <Bar dataKey="orders" fill="#2563eb" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </article>
                    </section>
                  </>
                )}

                {reportPage === "products" && (
                  <>
                    <section className="reports-grid">
                      <article className="surface-card reports-span-two">
                        <h2>Top Products by Sales</h2>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={productTopChart}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" hide />
                            <YAxis />
                            <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Sales"]} />
                            <Bar dataKey="revenue" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </article>
                    </section>

                    <section className="bi-layout-two">
                      <article className="surface-card bi-table-card">
                        <div className="pb-table-toolbar">
                          <h2>Product Table</h2>
                          <span>{filteredProducts.length.toLocaleString()} rows</span>
                        </div>

                        <div className="bi-table-wrap">
                          <table className="data-table bi-data-table">
                            <thead>
                              <tr>
                                <th>Product</th>
                                <th>Orders</th>
                                <th>Units Sold</th>
                                <th>Sales</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredProducts.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="table-empty-cell">
                                    No products match current filter.
                                  </td>
                                </tr>
                              ) : (
                                filteredProducts.slice(0, 120).map((row: BIProductRow) => (
                                  <tr
                                    key={row.name}
                                    className={selectedProduct === row.name ? "selected" : ""}
                                    onClick={() => setSelectedProduct(row.name)}
                                  >
                                    <td>{row.name}</td>
                                    <td>{row.transactionCount.toLocaleString()}</td>
                                    <td>{Math.round(row.quantity).toLocaleString()}</td>
                                    <td>{formatCurrency(row.revenue)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </article>

                      <article className="surface-card bi-detail-card">
                        <div className="pb-table-toolbar">
                          <h2>Product Insight</h2>
                          <span>{selectedProduct || "No product"}</span>
                        </div>

                        {detailLoading ? <p className="muted-text">Loading product detail...</p> : null}
                        {detailError ? <p className="error-pill">{detailError}</p> : null}

                        {!detailLoading && detail && (
                          <>
                            <div className="diagnostics-grid">
                              <div className="diagnostic-metric">
                                <span>Product</span>
                                <strong>{detail.name}</strong>
                              </div>
                              <div className="diagnostic-metric">
                                <span>Orders</span>
                                <strong>{detail.transactionCount.toLocaleString()}</strong>
                              </div>
                              <div className="diagnostic-metric">
                                <span>Total Sales</span>
                                <strong>{formatCurrency(detail.revenue)}</strong>
                              </div>
                              <div className="diagnostic-metric">
                                <span>Average Price</span>
                                <strong>{formatCurrency(detail.avgPrice)}</strong>
                              </div>
                            </div>

                            {selectedProductSummary && (
                              <p className="muted-text bi-share-note">
                                Appears in {formatPercent(selectedProductSummary.transactionShare)} of analyzed orders.
                              </p>
                            )}

                            <div className="related-rules-block">
                              <h4>Frequently Bought Together</h4>
                              {detail.topCoPurchased.length === 0 ? (
                                <p className="muted-text">No co-purchase records available for this product.</p>
                              ) : (
                                <ul>
                                  {detail.topCoPurchased.map((entry) => (
                                    <li key={entry.item}>
                                      <p>{entry.item}</p>
                                      <span>
                                        {entry.coOccurrenceCount} orders ({formatPercent(entry.coOccurrenceRate)})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </>
                        )}
                      </article>
                    </section>
                  </>
                )}

                {reportPage === "associations" && (
                  <section className="surface-card">
                    <div className="pb-table-toolbar">
                      <h2>Association Rules</h2>
                      <span>{filteredRules.length.toLocaleString()} rows</span>
                    </div>

                    <div className="bi-table-wrap">
                      <table className="data-table bi-data-table">
                        <thead>
                          <tr>
                            <th>Antecedent</th>
                            <th>Consequent</th>
                            <th>Support</th>
                            <th>Confidence</th>
                            <th>Lift</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRules.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="table-empty-cell">
                                No rules match current filters.
                              </td>
                            </tr>
                          ) : (
                            filteredRules.slice(0, 250).map((rule, index) => (
                              <tr key={`${rule.antecedent}-${rule.consequent}-${index}`}>
                                <td>{rule.antecedent}</td>
                                <td>{rule.consequent}</td>
                                <td>{rule.support.toFixed(3)}</td>
                                <td>{rule.confidence.toFixed(3)}</td>
                                <td>{rule.lift.toFixed(3)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}

            {workspaceView === "data" && (
              <>
                <div className="pb-pane-header">
                  <h3>Data View</h3>
                  <span>{filteredTransactions.length.toLocaleString()} rows after filters</span>
                </div>

                <section className="pb-filter-bar">
                  <div className="pb-filter-item">
                    <label htmlFor="data-country-filter">
                      <FiFilter /> Country Filter
                    </label>
                    <select
                      id="data-country-filter"
                      value={countryFilter}
                      onChange={(event) => setCountryFilter(event.target.value)}
                    >
                      {countries.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pb-filter-item">
                    <label htmlFor="data-search">
                      <FiSearch /> Search Rows
                    </label>
                    <input
                      id="data-search"
                      value={transactionSearch}
                      onChange={(event) => setTransactionSearch(event.target.value)}
                      placeholder="Search order id, country, or product"
                    />
                  </div>
                </section>

                <section className="surface-card">
                  <div className="pb-table-toolbar">
                    <h2>Orders Data Grid</h2>
                    <span>
                      Page {dataPage} of {totalDataPages}
                    </span>
                  </div>

                  <div className="bi-table-wrap bi-transaction-wrap">
                    <table className="data-table bi-data-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Country</th>
                          <th>Products</th>
                          <th>Total Units</th>
                          <th>Total Sales</th>
                          <th>Order Preview</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="table-empty-cell">
                              No rows match current data filters.
                            </td>
                          </tr>
                        ) : (
                          pagedTransactions.map((row: BITransactionRow) => (
                            <tr key={row.invoice}>
                              <td>{row.invoice}</td>
                              <td>{row.country}</td>
                              <td>{row.itemCount}</td>
                              <td>{Math.round(row.totalQuantity)}</td>
                              <td>{formatCurrency(row.totalValue)}</td>
                              <td>{row.items.slice(0, 3).join(", ")}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="pb-pager">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setDataPage((prev) => Math.max(1, prev - 1))}
                      disabled={dataPage <= 1}
                    >
                      Previous
                    </button>
                    <p>
                      Showing {pagedTransactions.length.toLocaleString()} rows
                    </p>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setDataPage((prev) => Math.min(totalDataPages, prev + 1))}
                      disabled={dataPage >= totalDataPages}
                    >
                      Next
                    </button>
                  </div>
                </section>
              </>
            )}

            {workspaceView === "model" && (
              <>
                <div className="pb-pane-header">
                  <h3>Model View</h3>
                  <span>Relationship diagram</span>
                </div>

                <section className="surface-card pb-model-canvas">
                  <h2>Semantic Model</h2>
                  <p>Business entities and relationships used by this report model.</p>

                  <div className="pb-rel-grid">
                    <article className="pb-rel-node">
                      <h4>Orders</h4>
                      <p>Order ID (Key)</p>
                      <p>Country</p>
                      <p>Total Units</p>
                      <p>Total Sales</p>
                    </article>

                    <article className="pb-rel-node">
                      <h4>Products</h4>
                      <p>Product Name (Key)</p>
                      <p>Orders</p>
                      <p>Units Sold</p>
                      <p>Sales</p>
                    </article>

                    <article className="pb-rel-node">
                      <h4>Associations</h4>
                      <p>Antecedent</p>
                      <p>Consequent</p>
                      <p>Support</p>
                      <p>Confidence</p>
                      <p>Lift</p>
                    </article>
                  </div>

                  <div className="pb-rel-links">
                    <span>Orders one to many Products by Order ID context</span>
                    <span>Products many to many Associations by product names</span>
                  </div>

                  <div className="diagnostics-grid">
                    <div className="diagnostic-metric">
                      <span>Orders Table Rows</span>
                      <strong>{transactions.length.toLocaleString()}</strong>
                    </div>
                    <div className="diagnostic-metric">
                      <span>Products Table Rows</span>
                      <strong>{products.length.toLocaleString()}</strong>
                    </div>
                    <div className="diagnostic-metric">
                      <span>Associations Table Rows</span>
                      <strong>{rules.length.toLocaleString()}</strong>
                    </div>
                    <div className="diagnostic-metric">
                      <span>Active Country Filter</span>
                      <strong>{countryFilter}</strong>
                    </div>
                  </div>
                </section>
              </>
            )}
          </main>

          <aside className="surface-card pb-viz-pane">
            <div className="pb-pane-header">
              <h3>Visualizations</h3>
              <span>Properties</span>
            </div>

            <div className="pb-viz-section">
              <p>Chart Type</p>
              <div className="pb-chip-row">
                <button
                  type="button"
                  className={`scope-chip ${visualType === "line" ? "active" : ""}`}
                  onClick={() => setVisualType("line")}
                >
                  <FiTrendingUp /> Line
                </button>
                <button
                  type="button"
                  className={`scope-chip ${visualType === "bar" ? "active" : ""}`}
                  onClick={() => setVisualType("bar")}
                >
                  <FiBarChart2 /> Bar
                </button>
              </div>
            </div>

            <div className="pb-viz-section">
              <p>Metric</p>
              <div className="pb-chip-row pb-chip-stack">
                <button
                  type="button"
                  className={`scope-chip ${metric === "orders" ? "active" : ""}`}
                  onClick={() => setMetric("orders")}
                  disabled={!availableMetrics.includes("orders")}
                >
                  <FiGrid /> Orders
                </button>
                <button
                  type="button"
                  className={`scope-chip ${metric === "sales" ? "active" : ""}`}
                  onClick={() => setMetric("sales")}
                  disabled={!availableMetrics.includes("sales")}
                >
                  <FiPieChart /> Sales
                </button>
                <button
                  type="button"
                  className={`scope-chip ${metric === "aov" ? "active" : ""}`}
                  onClick={() => setMetric("aov")}
                  disabled={!availableMetrics.includes("aov")}
                >
                  <FiSliders /> Avg Order Value
                </button>
              </div>
            </div>

            <div className="pb-viz-section">
              <p>Visual Wells</p>
              <div className="pb-viz-wells">
                <div className="pb-viz-well">
                  <h4>
                    <FiSettings /> X Axis
                  </h4>
                  <span>Period</span>
                </div>
                <div className="pb-viz-well">
                  <h4>
                    <FiActivity /> Y Axis
                  </h4>
                  <span>{metricConfig.label}</span>
                </div>
                <div className="pb-viz-well">
                  <h4>
                    <FiFilter /> Filter
                  </h4>
                  <span>Country: {countryFilter}</span>
                </div>
              </div>
            </div>

            <div className="pb-viz-section">
              <p>Status</p>
              <div className="pb-note">
                <strong>Ready</strong>
                <span>
                  {transactionsByCountry.length.toLocaleString()} orders and {products.length.toLocaleString()} products loaded.
                </span>
              </div>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

export default BIAnalytics;
