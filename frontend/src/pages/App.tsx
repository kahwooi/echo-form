import { ConfigProvider } from "antd";
import { CompanyForm } from "../components/form/CompanyForm";
import { ResidentForm } from "@/components/form/ResidentForm";
import "../styles/index.css";
import msMY from 'antd/locale/ms_MY';
import { Route, Routes } from "react-router-dom";
import { Home } from "./Home";

export function App() {
  return (
    <ConfigProvider locale={msMY}>
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/resident" element={<ResidentForm />} />
          <Route path="/company" element={<CompanyForm />} />
        </Routes>
      </div>
    </ConfigProvider>
  );
}

export default App;
