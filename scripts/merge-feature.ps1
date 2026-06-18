# PolyCal shortcut: promote current feature/* branch to dev via GitHub PR.
# Usage: merge-feature          (push + open PR)
#        merge-feature -Merge   (push + open PR + wait for CI + merge)
param(
  [switch]$Merge
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  if ($Merge) {
    npm run merge-feature -- --merge
  } else {
    npm run merge-feature
  }
} finally {
  Pop-Location
}
