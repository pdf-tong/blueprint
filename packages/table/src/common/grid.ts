/**
 * Copyright 2016 Palantir Technologies, Inc. All rights reserved.
 * Licensed under the BSD-3 License as modified (the “License”); you may obtain a copy
 * of the license at https://github.com/palantir/blueprint/blob/master/LICENSE
 * and https://github.com/palantir/blueprint/blob/master/PATENTS
 */

import * as React from "react";

import { IRegion, RegionCardinality, Regions } from "../regions";
import { Rect } from "./rect";
import { Utils } from "./utils";

export type ICellMapper<T> = (rowIndex: number, columnIndex: number) => T;
export type IRowMapper<T> = (rowIndex: number) => T;
export type IColumnMapper<T> = (columnIndex: number) => T;

export interface IRowIndices {
    rowIndexStart: number;
    rowIndexEnd: number;
}

export interface IColumnIndices {
    columnIndexStart: number;
    columnIndexEnd: number;
}

const EXTREMA_LAST_IN_ROW = ["bp-table-last-in-row"];
const EXTREMA_LAST_IN_COLUMN = ["bp-table-last-in-column"];
const EXTREMA_LAST_IN_ROW_AND_COLUMN = ["bp-table-last-in-column", "bp-table-last-in-row"];
const EXTREMA_NONE: string[] = [];

/**
 * This class manages the sizes of grid cells using arrays of individual row/column sizes.
 */
export class Grid {
    public static DEFAULT_BLEED = 3;
    public static DEFAULT_MAX_COLUMNS = 50;
    public static DEFAULT_MAX_ROWS = 200;
    public static DEFAULT_GHOST_HEIGHT = 20;
    public static DEFAULT_GHOST_WIDTH = 150;

    public numCols: number;
    public numRows: number;
    private bleed: number;
    private columnWidths: number[];
    private rowHeights: number[];
    private cumulativeColumnWidths: number[];
    private cumulativeRowHeights: number[];
    private ghostHeight: number;
    private ghostWidth: number;

    /**
     * This constructor accumulates the heights and widths in `O(n)`, saving
     * time in later calculations.
     *
     * @param bleed - The number of rows/cols that we expand beyond the
     *     viewport (on all sides). This helps avoid displaying an empty
     *     viewport when the user scrolls quickly.
     */
    public constructor(
        rowHeights: number[],
        columnWidths: number[],
        bleed = Grid.DEFAULT_BLEED,
        ghostHeight = Grid.DEFAULT_GHOST_HEIGHT,
        ghostWidth = Grid.DEFAULT_GHOST_WIDTH,
    ) {
        this.columnWidths = columnWidths;
        this.rowHeights = rowHeights;
        this.cumulativeColumnWidths = Utils.accumulate(columnWidths);
        this.cumulativeRowHeights = Utils.accumulate(rowHeights);
        this.numCols = columnWidths.length;
        this.numRows = rowHeights.length;
        this.bleed = bleed;
        this.ghostHeight = ghostHeight;
        this.ghostWidth = ghostWidth;
    }

    /**
     * Returns the `Rect` bounds of a cell in scrollpane client space.
     *
     * Scrollpane client coordinate space uses the origin of the scrollpane
     * client (the inside part that you're moving around).
     *
     * For example, let's say you're scrolling around a block of 1000 x 1000
     * cells. Regardless where you've scrolled, the first cell is always at
     * 0,0 in scrollpane client space. the cell to the right of it is always
     * at, e.g., 100,0.
     */
    public getCellRect(rowIndex: number, columnIndex: number) {
        const height = this.rowHeights[rowIndex];
        const top = this.cumulativeRowHeights[rowIndex] - height;
        const width = this.columnWidths[columnIndex];
        const left = this.cumulativeColumnWidths[columnIndex] - width;
        return new Rect(left, top, width, height);
    }

    /**
     * Returns the `Rect` bounds of a cell in scrollpane client space.
     *
     * If the cell is beyond the bounds of the user-defined table cells, it is
     * considered a "ghost" cell. If a width/height is not defined for that
     * row/column, we use the default width/height.
     */
    public getGhostCellRect(rowIndex: number, columnIndex: number) {
        let left = 0;
        let top = 0;
        let width = 0;
        let height = 0;
        if (rowIndex >= this.rowHeights.length) {
            height = this.ghostHeight;
            top = this.getHeight() + this.ghostHeight * (rowIndex - this.numRows);
        } else {
            height = this.rowHeights[rowIndex];
            top = this.cumulativeRowHeights[rowIndex] - height;
        }

        if (columnIndex >= this.columnWidths.length) {
            width = this.ghostWidth;
            left = this.getWidth() + this.ghostWidth * (columnIndex - this.numCols);
        } else {
            width = this.columnWidths[columnIndex];
            left = this.cumulativeColumnWidths[columnIndex] - width;
        }
        return new Rect(left, top, width, height);
    }

    /**
     * Returns the `Rect` with the base coordinate and height of the specified row.
     */
    public getRowRect(rowIndex: number) {
        const height = this.rowHeights[rowIndex];
        const top = this.cumulativeRowHeights[rowIndex] - height;
        return new Rect(0, top, this.getWidth(), height);
    }

    /**
     * Returns the `Rect` with the base coordinate and width of the specified column.
     */
    public getColumnRect(columnIndex: number) {
        const width = this.columnWidths[columnIndex];
        const left = this.cumulativeColumnWidths[columnIndex] - width;
        return new Rect(left, 0, width, this.getHeight());
    }

    /**
     * Returns the total width of the entire grid
     */
    public getWidth() {
        return this.cumulativeColumnWidths[this.numCols - 1];
    }

    /**
     * Returns the total width of the entire grid
     */
    public getHeight() {
        return this.cumulativeRowHeights[this.numRows - 1];
    }

    /**
     * Returns the `Rect` bounds of entire grid
     */
    public getRect() {
        return new Rect(0, 0, this.getWidth(), this.getHeight());
    }

    /**
     * Maps each cell that intersects with the given `Rect` argument. The
     * indices of iteration are extended in both directions by the integer
     * `bleed` class property, then are clamped between 0 and the number of
     * rows/columns.
     *
     * Uses a binary search for each of the 4 edges of the bounds, resulting
     * in a runtime of `O(log(rows) + log(cols))` plus the `O(irows * icols)`
     * iteration of intersecting cells.
     */
    public mapCellsInRect<T>(rect: Rect, callback: ICellMapper<T>): T[] {
        const results: T[] = [];
        if (rect == null) {
            return results;
        }

        const {rowIndexStart, rowIndexEnd} = this.getRowIndicesInRect(rect);
        const {columnIndexStart, columnIndexEnd} = this.getColumnIndicesInRect(rect);
        for (let rowIndex = rowIndexStart; rowIndex <= rowIndexEnd; rowIndex++) {
            for (let columnIndex = columnIndexStart; columnIndex <= columnIndexEnd; columnIndex++) {
                results.push(callback(rowIndex, columnIndex));
            }
        }
        return results;
    }

    /**
     * Maps each row that intersects with the given `Rect` argument.
     *
     * See Grid.mapCellsInRect for more details.
     */
    public mapRowsInRect<T>(rect: Rect, callback: IRowMapper<T>): T[] {
        const results: T[] = [];
        if (rect == null) {
            return results;
        }

        const {rowIndexStart, rowIndexEnd} = this.getRowIndicesInRect(rect);
        for (let rowIndex = rowIndexStart; rowIndex <= rowIndexEnd; rowIndex++) {
            results.push(callback(rowIndex));
        }
        return results;
    }

    /**
     * Maps each column that intersects with the given `Rect` argument.
     *
     * See Grid.mapCellsInRect for more details.
     */
    public mapColumnsInRect<T>(rect: Rect, callback: IColumnMapper<T>): T[] {
        const results: T[] = [];
        if (rect == null) {
            return results;
        }

        const {columnIndexStart, columnIndexEnd} = this.getColumnIndicesInRect(rect);
        for (let columnIndex = columnIndexStart; columnIndex <= columnIndexEnd; columnIndex++) {
            results.push(callback(columnIndex));
        }
        return results;
    }

    /**
     * Returns the start and end indices of rows that intersect with the given
     * `Rect` argument.
     */
    public getRowIndicesInRect(
        rect: Rect,
        includeGhostCells = false,
        limit = Grid.DEFAULT_MAX_ROWS,
    ): IRowIndices {

        if (rect == null) {
            return {rowIndexEnd: 0, rowIndexStart: 0};
        }

        const searchEnd = includeGhostCells ? Math.max(this.numRows, Grid.DEFAULT_MAX_ROWS) : this.numRows;
        let {start, end} = this.getIndicesInInterval(
            rect.top,
            rect.top + rect.height,
            searchEnd,
            !includeGhostCells,
            this.getCumulativeHeightAt,
        );

        if (limit > 0 && end - start > limit) {
            end = start + limit;
        }

        return {
            rowIndexEnd: end,
            rowIndexStart: start,
        };
    }

    /**
     * Returns the start and end indices of columns that intersect with the
     * given `Rect` argument.
     */
    public getColumnIndicesInRect(
        rect: Rect,
        includeGhostCells = false,
        limit = Grid.DEFAULT_MAX_COLUMNS,
    ): IColumnIndices {

        if (rect == null) {
            return {columnIndexEnd: 0, columnIndexStart: 0};
        }

        const searchEnd = includeGhostCells ? Math.max(this.numCols, Grid.DEFAULT_MAX_COLUMNS) : this.numCols;
        let {start, end} = this.getIndicesInInterval(
            rect.left,
            rect.left + rect.width,
            searchEnd,
            !includeGhostCells,
            this.getCumulativeWidthAt,
        );

        if (limit > 0 && end - start > limit) {
            end = start + limit;
        }

        return {
            columnIndexEnd: end,
            columnIndexStart: start,
        };
    }

    public isGhostIndex(rowIndex: number, columnIndex: number) {
        return (rowIndex >= this.numRows || columnIndex >= this.numCols);
    }

    public getExtremaClasses(rowIndex: number, columnIndex: number, rowEnd: number, columnEnd: number) {
        if (rowIndex === rowEnd && columnIndex === columnEnd) {
            return EXTREMA_LAST_IN_ROW_AND_COLUMN;
        }
        if (rowIndex === rowEnd) {
            return EXTREMA_LAST_IN_COLUMN;
        }
        if (columnIndex === columnEnd) {
            return EXTREMA_LAST_IN_ROW;
        }
        return EXTREMA_NONE;
    }

    public getRegionStyle(region: IRegion) {
        const cardinality = Regions.getRegionCardinality(region);
        switch (cardinality) {
            case RegionCardinality.CELLS: {
                const cellRect0 = this.getCellRect(region.rows[0], region.cols[0]);
                const cellRect1 = this.getCellRect(region.rows[1], region.cols[1]);
                const offsetLeft = region.cols[0] === 0 ? 0 : 1;
                const offsetTop = region.rows[0] === 0 ? 0 : 1;
                const rect = cellRect0.union(cellRect1);
                rect.height += offsetTop;
                rect.left -= offsetLeft;
                rect.width += offsetLeft;
                rect.top -= offsetTop;
                return Object.assign(rect.style(), { display: "block" });
            }

            case RegionCardinality.FULL_COLUMNS: {
                const cellRect0 = this.getCellRect(0, region.cols[0]);
                const cellRect1 = this.getCellRect(0, region.cols[1]);
                const rect = cellRect0.union(cellRect1);
                const offsetLeft = region.cols[0] === 0 ? 0 : 1;
                return {
                    bottom: 0,
                    display: "block",
                    left: rect.left - offsetLeft,
                    top: 0,
                    width: rect.width + offsetLeft,
                };
              }

            case RegionCardinality.FULL_ROWS: {
                const cellRect0 = this.getCellRect(region.rows[0], 0);
                const cellRect1 = this.getCellRect(region.rows[1], 0);
                const rect = cellRect0.union(cellRect1);
                const offsetTop = region.rows[0] === 0 ? 0 : 1;
                return {
                    display: "block",
                    height: rect.height + offsetTop,
                    left: 0,
                    right: 0,
                    top: rect.top - offsetTop,
                };
            }

            case RegionCardinality.FULL_TABLE:
                return {
                    bottom: 0,
                    display: "block",
                    left: 0,
                    right: 0,
                    top: 0,
                };

            default: return { display: "none" };
        }
    }

    public getCumulativeWidthAt = (index: number) => {
        if (index >= this.numCols) {
            return this.cumulativeColumnWidths[this.numCols - 1] + this.ghostWidth * (index - this.numCols + 1);
        } else {
            return this.cumulativeColumnWidths[index];
        }
    }

    public getCumulativeHeightAt = (index: number) => {
        if (index >= this.numRows) {
            return this.cumulativeRowHeights[this.numRows - 1] + this.ghostHeight * (index - this.numRows + 1);
        } else {
            return this.cumulativeRowHeights[index];
        }
    }

    private getIndicesInInterval(
        min: number,
        max: number,
        count: number,
        useEndBleed: boolean,
        lookup: (index: number) => number,
    ) {
        let start = Utils.binarySearch(min, count - 1, lookup);
        let end = Utils.binarySearch(max, count - 1, lookup);

        // correct exact pixel alignment
        if (start >= 0 && min === lookup(start)) {
            start += 1;
        }

        // apply bounded bleeds
        start = Math.max(0, start - this.bleed);
        if (useEndBleed) {
            end = Math.min(count - 1, end + this.bleed);
        } else {
            end = Math.min(count - 1, end);
        }
        return {start, end};
    }
}
