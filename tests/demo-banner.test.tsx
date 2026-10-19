// @vitest-environment jsdom
// Botón "Empezar con mis datos": aviso a la vista, confirmación que explica qué se borra y errores visibles.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAppStore } from "@/store/use-app-store";
import { DemoBanner } from "@/components/layout/demo-banner";

afterEach(cleanup);

describe("botón Empezar con mis datos", () => {
  it("muestra el aviso y, antes de borrar, pide confirmar explicando qué se pierde", async () => {
    const clearData = vi.fn(async () => ({ ok: true as const, value: undefined }));
    useAppStore.setState({ clearData });
    render(<DemoBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/datos de ejemplo/i);

    await userEvent.click(screen.getByRole("button", { name: /empezar con mis datos/i }));
    expect(clearData).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/usuarios que invitaste se conservan/i);

    await userEvent.click(screen.getByRole("button", { name: /sí, empezar con mis datos/i }));
    await waitFor(() => expect(clearData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cancelar no borra nada", async () => {
    const clearData = vi.fn(async () => ({ ok: true as const, value: undefined }));
    useAppStore.setState({ clearData });
    render(<DemoBanner />);
    await userEvent.click(screen.getByRole("button", { name: /empezar con mis datos/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(clearData).not.toHaveBeenCalled();
  });

  it("si falla, deja el diálogo abierto con el error", async () => {
    const clearData = vi.fn(async () => ({ ok: false as const, error: "No se pudo guardar" }));
    useAppStore.setState({ clearData });
    render(<DemoBanner />);
    await userEvent.click(screen.getByRole("button", { name: /empezar con mis datos/i }));
    await userEvent.click(screen.getByRole("button", { name: /sí, empezar con mis datos/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo guardar/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
