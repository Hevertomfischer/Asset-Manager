import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { role: string }, isLoading: false, isPro: false },
  sync: {
    data: {
      lastSyncAt: "2026-11-13T12:00:00Z", isRunning: false,
      marketStatus: "open", providersDegraded: false,
      lastMarketCheckAt: "2026-11-13T12:30:00Z",
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  },
  projections: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@workspace/api-client-react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/api-client-react")>(),
  useGetSyncStatus: () => mocks.sync,
  useGetCurrentRound: () => ({ data: { round: 35 }, isLoading: false, isError: false }),
  useGetCurrentMatches: () => ({ data: { matches: [] }, isLoading: false, isError: false }),
  useGetCurrentAvailability: () => ({ data: { availability: [] } }),
  useGetCurrentProjections: mocks.projections,
  useGetProvidersStatus: () => { throw new Error("Dashboard must not call private provider status"); },
  useGetAdminConfig: () => { throw new Error("Dashboard must not call private configuration"); },
}));
import { RequireAdmin } from "../RequireAdmin";
import { SyncStatusCard } from "../SyncStatusCard";
import Dashboard from "@/pages/dashboard";

afterEach(cleanup);
beforeEach(() => {
  mocks.auth.user = { role: "user" };
  mocks.auth.isPro = false;
  mocks.auth.isLoading = false;
  mocks.sync.isError = false;
  mocks.projections.mockClear();
  mocks.projections.mockReturnValue({ data: { projections: [] }, isLoading: false, isError: false });
});
function guard(children: React.ReactNode) {
  return (
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/" element={<div>Página inicial</div>} />
        <Route path="/admin" element={<RequireAdmin>{children}</RequireAdmin>} />
      </Routes>
    </MemoryRouter>
  );
}
test.each([null, { role: "user" }])("non-admin redirects home without mounting the admin page: %j", (user) => {
  mocks.auth.user = user;
  const AdminPage = vi.fn(() => <div>Admin privado</div>);
  render(guard(<AdminPage />));
  expect(screen.getByText("Página inicial")).toBeInTheDocument();
  expect(AdminPage).not.toHaveBeenCalled();
});
test("admin session renders the protected page", () => {
  mocks.auth.user = { role: "admin" };
  render(guard(<div>Admin privado</div>));
  expect(screen.getByText("Admin privado")).toBeInTheDocument();
});
test("loading authentication never flashes admin content", () => {
  mocks.auth.isLoading = true;
  render(guard(<div>Admin privado</div>));
  expect(screen.getByRole("status")).toHaveTextContent("Verificando acesso");
  expect(screen.queryByText("Admin privado")).not.toBeInTheDocument();
});
test("ordinary free dashboard shows public status and requests public sanitized projections", () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText("Status dos dados")).toBeInTheDocument();
  expect(screen.getByText("Dados sincronizados")).toBeInTheDocument();
  expect(screen.getByText("Última consulta ao mercado")).toBeInTheDocument();
  expect(screen.queryByText("Não foi possível carregar o painel")).not.toBeInTheDocument();
  expect(screen.queryByText("Gerenciar Pipeline")).not.toBeInTheDocument();
  expect(mocks.projections).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    query: expect.objectContaining({ enabled: true }),
  }));
});
test("public status query error remains confined to the status card", () => {
  mocks.sync.isError = true;
  render(<MemoryRouter><SyncStatusCard isAdmin={false} /></MemoryRouter>);
  expect(screen.getByRole("alert")).toHaveTextContent("Status dos dados indisponível");
  expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
});
test("admin can still navigate to the detailed pipeline", () => {
  render(<MemoryRouter><SyncStatusCard isAdmin /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Gerenciar Pipeline" })).toHaveAttribute("href", "/admin");
});
