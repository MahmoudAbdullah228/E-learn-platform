import { BrowserRouter, Routes, Route } from 'react-router-dom';

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8 text-2xl font-bold text-blue-600">E-Learning Platform Home</div>} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRoutes;