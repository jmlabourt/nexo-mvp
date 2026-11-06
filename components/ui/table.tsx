import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  // One set of cells/actions: narrow containers present these same rows as labelled cards.
  const textOf = (node: React.ReactNode): string => React.Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return React.isValidElement<{ children?: React.ReactNode }>(child) ? textOf(child.props.children) : "";
  }).join(" ").trim();
  const labels: string[] = [];
  React.Children.forEach(props.children, (section) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(section) || section.type !== THead) return;
    React.Children.forEach(section.props.children, (row) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(row)) return;
      const visit = (children: React.ReactNode) => React.Children.forEach(children, (cell) => {
        if (!React.isValidElement<{ children?: React.ReactNode }>(cell)) return;
        if (cell.type === React.Fragment) visit(cell.props.children);
        else labels.push(textOf(cell.props.children) || "Acciones");
      });
      visit(row.props.children);
    });
  });
  const children = React.Children.map(props.children, (section) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(section) || section.type !== TBody) return section;
    return React.cloneElement(section, { children: React.Children.map(section.props.children, (row) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(row)) return row;
      let column = 0;
      const labelCells = (cells: React.ReactNode): React.ReactNode => React.Children.map(cells, (cell) => {
        if (!React.isValidElement<React.TdHTMLAttributes<HTMLTableCellElement> & { "data-label"?: string }>(cell)) return cell;
        if (cell.type === React.Fragment) return React.cloneElement(cell, { children: labelCells(cell.props.children) });
        const label = labels[column];
        column += cell.props.colSpan ?? 1;
        return React.cloneElement(cell, { "data-label": cell.props["data-label"] ?? label });
      });
      return React.cloneElement(row, { children: labelCells(row.props.children) });
    }) });
  });
  return (
    <div className="blerp-table-container relative min-w-0 w-full">
      <table className={cn("blerp-table w-full caption-bottom text-sm", className)} {...props}>{children}</table>
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={cn("border-b border-slate-200 bg-slate-50/60", props.className)} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={cn("divide-y divide-slate-100", props.className)} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors", className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-11 px-3 py-2 text-left align-middle text-xs font-semibold text-slate-600", className)}
      {...props}
    />
  );
}
export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle text-slate-700", className)} {...props}>{children !== undefined && children !== null && <div className="min-w-0">{children}</div>}</td>;
}
