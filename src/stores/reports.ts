import { create } from "zustand";

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  agent: string;
  prompt: string;
  approved: boolean;
}

export interface Report {
  id: string;
  automationId: string;
  automationName: string;
  timestamp: string;
  status: "pending" | "approved" | "dismissed";
  summary: string;
  suggestedActions: SuggestedAction[];
}

interface ReportsState {
  reports: Report[];
  selectedReport: Report | null;
  loading: boolean;

  setReports: (reports: Report[]) => void;
  addReport: (report: Report) => void;
  selectReport: (report: Report | null) => void;
  setLoading: (loading: boolean) => void;
  approveReport: (id: string) => void;
  dismissReport: (id: string) => void;
  approveAction: (reportId: string, actionId: string) => void;
}

export const useReportsStore = create<ReportsState>((set) => ({
  reports: [],
  selectedReport: null,
  loading: false,

  setReports: (reports) => set({ reports }),
  addReport: (report) =>
    set((state) => ({
      reports: [report, ...state.reports],
    })),
  selectReport: (report) => set({ selectedReport: report }),
  setLoading: (loading) => set({ loading }),
  approveReport: (id) =>
    set((state) => ({
      reports: state.reports.map((r) =>
        r.id === id
          ? { ...r, status: "approved" as const, suggestedActions: r.suggestedActions.map((a) => ({ ...a, approved: true })) }
          : r,
      ),
      selectedReport:
        state.selectedReport?.id === id
          ? { ...state.selectedReport, status: "approved" as const, suggestedActions: state.selectedReport.suggestedActions.map((a) => ({ ...a, approved: true })) }
          : state.selectedReport,
    })),
  dismissReport: (id) =>
    set((state) => ({
      reports: state.reports.map((r) =>
        r.id === id ? { ...r, status: "dismissed" as const } : r,
      ),
      selectedReport:
        state.selectedReport?.id === id
          ? { ...state.selectedReport, status: "dismissed" as const }
          : state.selectedReport,
    })),
  approveAction: (reportId, actionId) =>
    set((state) => {
      const updateActions = (r: Report) =>
        r.id === reportId
          ? {
              ...r,
              suggestedActions: r.suggestedActions.map((a) =>
                a.id === actionId ? { ...a, approved: true } : a,
              ),
            }
          : r;
      return {
        reports: state.reports.map(updateActions),
        selectedReport: state.selectedReport
          ? updateActions(state.selectedReport)
          : null,
      };
    }),
}));
