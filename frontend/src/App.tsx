import { ConfigProvider } from "antd";
import { UploadForm } from "./UploadForm";
import "./index.css";
import msMY from 'antd/locale/ms_MY';

export function App() {
  return (
    <ConfigProvider locale={msMY}>
      <div className="app">
        <UploadForm />
      </div>
    </ConfigProvider>
  );
}

export default App;
