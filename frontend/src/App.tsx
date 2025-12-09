import { ConfigProvider } from "antd";
import { CompanyForm } from "./form/CompanyForm";
import "./index.css";
import msMY from 'antd/locale/ms_MY';
import { Route, Routes } from "react-router-dom";
import { ResidentForm } from "./form/ResidentForm";
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
