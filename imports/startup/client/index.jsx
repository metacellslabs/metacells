import { createRoot } from 'react-dom/client';
import { App } from '../../ui/app/App.jsx';
import '../../../client/main.css';

const container = document.getElementById('react-target');
const root = createRoot(container);
root.render(<App />);
