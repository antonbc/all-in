import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
import { App } from "./app.tsx"
import "./styles.css"

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

const root = document.querySelector("#root")
if (root) createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
