import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Fingerprint,
  Flame,
  Layers,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  Zap
} from 'lucide-react';
import React from 'react';

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignIn, onSignUp }) => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-sky-500/30 selection:text-sky-200">
      {/* 1. Simple SaaS Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/80 px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Brand & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-sky-950/50">
              <Server className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                SkyOps
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-sky-400 border border-zinc-700">
                  v1.4
                </span>
              </div>
              <div className="text-xs font-mono text-zinc-400 leading-tight">
                Kubernetes Incident Platform
              </div>
            </div>
          </div>

          {/* Right: Auth CTAs */}
          <div className="flex items-center gap-3">
            <button
              id="landing-signin-btn"
              onClick={onSignIn}
              className="text-xs font-mono text-zinc-300 hover:text-zinc-100 px-3.5 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              id="landing-signup-btn"
              onClick={onSignUp}
              className="text-xs font-mono font-semibold bg-sky-500 hover:bg-sky-400 text-zinc-950 px-4 py-2 rounded-lg shadow-sm hover:shadow-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              Sign Up
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 px-6 lg:px-12 border-b border-zinc-800/60">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-sky-400 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Production-Ready Kubernetes Observability & Triage
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-100 leading-[1.15]">
            Automated Kubernetes Incident <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-sky-400 via-sky-200 to-indigo-300 bg-clip-text text-transparent">
              Detection & Monitoring
            </span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 max-w-3xl mx-auto leading-relaxed">
            Connect your cluster with a lightweight agent and detect failures, pod crashes, and
            infrastructure anomalies instantly. Zero telemetry lag, deterministic deduplication, and
            read-only security.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              id="hero-get-started-btn"
              onClick={onSignUp}
              className="w-full sm:w-auto px-6 py-3.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              id="hero-signin-btn"
              onClick={onSignIn}
              className="w-full sm:w-auto px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-mono text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Sign In
            </button>
          </div>

          {/* Quick specs pill */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-zinc-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Non-Privileged Read-Only RBAC
            </span>
            <span className="text-zinc-700">•</span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-sky-400" />
              Sub-second Failure Deduplication
            </span>
            <span className="text-zinc-700">•</span>
            <span className="flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-amber-400" />
              1-Command Helm & Kubectl Install
            </span>
          </div>
        </div>
      </section>

      {/* 3. What SkyOps Does (3 Clean Feature Blocks) */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Engineered for Modern Site Reliability
          </h2>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            What SkyOps Does
          </p>
          <p className="text-sm text-zinc-400 font-mono">
            Purpose-built algorithms designed to eliminate cluster noise and pinpoint root-cause anomalies.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400">
              <Flame className="w-6 h-6 text-sky-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-100">Autonomous Incident Detection</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Detect <code className="text-sky-300 font-mono">CrashLoopBackOff</code>,{' '}
                <code className="text-rose-300 font-mono">OOMKills</code>,{' '}
                <code className="text-amber-300 font-mono">ImagePullBackOff</code>, and degraded replica
                controllers automatically before outages impact users.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Continuous kubelet & event streaming
            </div>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
              <Fingerprint className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-100">Deterministic Deduplication</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Correlate cascading failure signals across replica pods and prevent alert fatigue using
                mathematical fingerprint hashing. 100 crashing pods generate 1 clear, actionable incident.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Hash signature-based correlation
            </div>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-all space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-100">Lightweight Cluster Agent</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Non-intrusive read-only daemon running with minimal resource overhead (&lt; 15MB RAM, 0.01 CPU).
                Requires no write permissions and no cluster-admin credentials.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              UID 65532 non-root execution
            </div>
          </div>
        </div>
      </section>

      {/* 4. How It Works (4 Clear Steps) */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Fast 4-Step Onboarding
          </h2>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            How SkyOps Works
          </p>
          <p className="text-sm text-zinc-400 font-mono">
            Get from account creation to real-time cluster triage in less than 3 minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: '01',
              title: 'Create Account & Org',
              description: 'Sign up with your work email and initialize a dedicated team organization.'
            },
            {
              step: '02',
              title: 'Add Kubernetes Cluster',
              description: 'Specify your target cluster name and environment tag (Production, Staging, Dev).'
            },
            {
              step: '03',
              title: 'Deploy SkyOps Agent',
              description: 'Run our single-command Helm 3 or kubectl manifest with a secure pairing key.'
            },
            {
              step: '04',
              title: 'Monitor & Triage',
              description: 'Stream live telemetry, view correlated incidents, and resolve operational bottlenecks.'
            }
          ].map((item) => (
            <div
              key={item.step}
              className="p-5 rounded-xl bg-zinc-900/30 border border-zinc-800 relative space-y-3"
            >
              <div className="text-2xl font-black font-mono text-sky-500/80">{item.step}</div>
              <h4 className="text-sm font-bold text-zinc-100">{item.title}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Product Preview Section */}
      <section className="py-20 px-6 lg:px-12 max-w-7xl mx-auto border-b border-zinc-800/60">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-sky-400">
            Interface Preview
          </h2>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Built for Real-World Incident Command
          </p>
          <p className="text-sm text-zinc-400 font-mono">
            Clean, high-density telemetry dashboards with instant incident categorization and drill-down logs.
          </p>
        </div>

        {/* Mock Dashboard Frame */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
          {/* Top window bar */}
          <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
              <span className="text-xs font-mono text-zinc-400 ml-2">app.skyops.io / production-gke-us-east</span>
            </div>
            <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              TELEMETRY CONNECTED
            </div>
          </div>

          {/* Realistic Dashboard Mockup */}
          <div className="p-6 space-y-6 bg-zinc-950">
            {/* Metric Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="text-[11px] font-mono text-zinc-500 uppercase">Active Clusters</div>
                <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">4 Connected</div>
                <div className="text-[10px] font-mono text-emerald-400 mt-1">● 100% Agent Heartbeats</div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="text-[11px] font-mono text-zinc-500 uppercase">Total Pods</div>
                <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">318 Tracked</div>
                <div className="text-[10px] font-mono text-zinc-400 mt-1">Across 18 Nodes</div>
              </div>
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/50">
                <div className="text-[11px] font-mono text-rose-400 uppercase">Active Incidents</div>
                <div className="text-2xl font-bold font-mono text-rose-300 mt-1">2 Open</div>
                <div className="text-[10px] font-mono text-rose-400 mt-1">1 Critical • 1 High</div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="text-[11px] font-mono text-zinc-500 uppercase">Mean Time to Triage</div>
                <div className="text-2xl font-bold font-mono text-sky-400 mt-1">1.2s</div>
                <div className="text-[10px] font-mono text-zinc-400 mt-1">Deterministic Dedupe</div>
              </div>
            </div>

            {/* Incidents Preview Table */}
            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
              <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-300">
                <span className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Live Incident Stream
                </span>
                <span className="text-zinc-500">Auto-refreshing</span>
              </div>
              <div className="divide-y divide-zinc-800/60 text-xs font-mono">
                <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-800/30">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-bold">
                      CRITICAL
                    </span>
                    <div>
                      <div className="text-zinc-100 font-semibold">payment-service-7f89c CrashLoopBackOff</div>
                      <div className="text-[11px] text-zinc-400">Exit Code 1 • Back-off restarting failed container</div>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-zinc-500">
                    <div>Cluster: production-gke-us-east</div>
                    <div className="text-zinc-400">2 min ago</div>
                  </div>
                </div>

                <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-800/30">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-bold">
                      HIGH
                    </span>
                    <div>
                      <div className="text-zinc-100 font-semibold">auth-worker-v2 ImagePullBackOff</div>
                      <div className="text-[11px] text-zinc-400">Failed to pull image registry.internal/auth:v2.9.1</div>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-zinc-500">
                    <div>Cluster: staging-aks-eu</div>
                    <div className="text-zinc-400">8 min ago</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA banner below mockup */}
        <div className="mt-12 text-center">
          <button
            onClick={onSignUp}
            className="px-8 py-4 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-500/20 inline-flex items-center gap-2 cursor-pointer"
          >
            Start Monitoring Your Clusters
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* 6. Simple SaaS Footer */}
      <footer className="py-12 px-6 lg:px-12 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs font-mono text-zinc-500">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-sky-400" />
          <span className="text-zinc-300 font-bold">SkyOps</span>
          <span>• Kubernetes Incident Management Platform</span>
        </div>

        <div className="flex items-center gap-6">
          <a href="#docs" onClick={(e) => { e.preventDefault(); }} className="hover:text-zinc-300 transition-colors">
            Documentation
          </a>
          <a href="#github" onClick={(e) => { e.preventDefault(); }} className="hover:text-zinc-300 transition-colors">
            GitHub
          </a>
          <a href="#security" onClick={(e) => { e.preventDefault(); }} className="hover:text-zinc-300 transition-colors">
            Security
          </a>
          <a href="#status" onClick={(e) => { e.preventDefault(); }} className="hover:text-zinc-300 transition-colors">
            Status
          </a>
        </div>
      </footer>
    </div>
  );
};
