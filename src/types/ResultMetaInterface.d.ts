/**
 * @license CC0-1.0
 * The author dedicates this file to the public domain via CC0 1.0 Universal.
 * 
 * To the extent possible under law, the author has waived all copyright
 * and related or neighboring rights to this work.
 * 
 * You can copy, modify, distribute and perform the work, even for commercial
 * purposes, all without asking permission.
 * 
 * Note: This dedication applies to this file as provided. Recipients may
 * incorporate it into projects with different licensing terms.
 * 
 * SPDX-License-Identifier: CC0-1.0
 */

import type Clutter from 'gi://Clutter';

/** Search result metadata.
 * 
 * Used by Shell to display search results.
 * 
 * [See Search Provider Implementation Example for more information](https://github.com/LumenGNU/ManSearchProvider) */
export interface ResultMeta {

    /** Unique identifier of the result */
    id: string;

    /** Name for the result (title) */
    name: string;

    /** Description of the result (optional). */
    description?: string;

    /** Text to place in the clipboard when the result is activated (optional). */
    clipboardText?: string;

    /** Callback function that returns an icon for the result at the specified size. */
    createIcon: (size: number) => Clutter.Actor;

}