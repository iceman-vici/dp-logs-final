import React, { useState } from 'react';
import { formatValue, getFormattedDuration } from '../utils/formatters';
import '../styles/CallsTable.css';

const CallsTable = ({ calls, loading }) => {
  const [sortField, setSortField] = useState('started_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  if (!calls || calls.length === 0) {
    return (
      <div className="no-data">
        <p>No calls available. Try syncing data from Dialpad.</p>
      </div>
    );
  }

  // Get columns from first call
  const columns = Object.keys(calls[0]).filter(key => !key.endsWith('_formatted'));

  // Sort calls
  const sortedCalls = [...calls].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  // Pagination
  const totalPages = Math.ceil(sortedCalls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCalls = sortedCalls.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderHeaderCell = (col) => {
    const displayName = col.replace(/_/g, ' ').toUpperCase();
    const isSortable = !['transcription_text', 'voicemail_link'].includes(col);
    
    return (
      <th 
        key={col}
        onClick={() => isSortable && handleSort(col)}
        className={isSortable ? 'sortable' : ''}
      >
        {displayName}
        {sortField === col && (
          <span className="sort-indicator">
            {sortOrder === 'asc' ? ' ▲' : ' ▼'}
          </span>
        )}
      </th>
    );
  };

  return (
    <div className="calls-table-container">
      {loading && <div className="loading-overlay">Updating...</div>}
      
      <div className="table-wrapper">
        <table className="calls-table">
          <thead>
            <tr>
              {columns.map(renderHeaderCell)}
            </tr>
          </thead>
          <tbody>
            {paginatedCalls.map((call, index) => (
              <tr key={call.call_id || index}>
                {columns.map((col) => (
                  <td key={col} className={`cell-${col}`}>
                    {col.includes('duration') 
                      ? getFormattedDuration(call, col) 
                      : formatValue(call[col], col)
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default CallsTable;