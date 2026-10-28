// SPDX-License-Identifier: GPL-3.0-or-later
// Placeholder renderer for M0 step 12: proves the window, preload, and CSP work. The Vue app
// replaces it in step 13.
const root = document.getElementById('app');
if (root !== null) {
  const heading = document.createElement('h1');
  heading.textContent = 'Paper Lion';
  root.append(heading);
}
