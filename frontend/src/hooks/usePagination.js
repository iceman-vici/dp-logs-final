import { useState, useMemo } from 'react';

const usePagination = (data, itemsPerPage = 10) => {
  const [currentPage, setCurrentPage] = useState(1);

  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentData = data.slice(startIndex, endIndex);

    return {
      currentData,
      currentPage,
      totalPages,
      totalItems: data.length,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, data.length),
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    };
  }, [data, currentPage, itemsPerPage]);

  const goToPage = (page) => {
    const { totalPages } = paginationData;
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
  };

  const nextPage = () => {
    if (paginationData.hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (paginationData.hasPrevPage) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const firstPage = () => setCurrentPage(1);
  
  const lastPage = () => setCurrentPage(paginationData.totalPages);

  const reset = () => setCurrentPage(1);

  return {
    ...paginationData,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    reset,
    setCurrentPage
  };
};

export default usePagination;