import { createRoot } from 'react-dom/client';
import { App } from '../imports/ui/app/App.jsx';
import './main.css';

const container = document.getElementById('react-target');
const root = createRoot(container);
root.render(<App />);
