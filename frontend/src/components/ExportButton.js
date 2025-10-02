import React, { useState } from 'react';
import { toast } from 'react-toastify';
import '../styles/ExportButton.css';

const ExportButton = ({ data, filename = 'export' }) => {
  const [exporting, setExporting] = useState(false);

  const exportToCSV = () => {
    setExporting(true);
    
    try {
      if (!data || data.length === 0) {
        toast.warning('No data to export');
        return;
      }

      // Get headers from first object
      const headers = Object.keys(data[0]);
      
      // Create CSV content
      const csvContent = [
        headers.join(','), // Header row
        ...data.map(row => 
          headers.map(header => {
            const value = row[header];
            // Handle special characters and commas in values
            if (value === null || value === undefined) return '';
            const stringValue = value.toString();
            return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
              ? `"${stringValue.replace(/"/g, '""')}"`
              : stringValue;
          }).join(',')
        )
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const exportToJSON = () => {
    setExporting(true);
    
    try {
      if (!data || data.length === 0) {
        toast.warning('No data to export');
        return;
      }

      const jsonContent = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-button-group">
      <button 
        onClick={exportToCSV}
        disabled={exporting || !data || data.length === 0}
        className="export-btn csv-btn"
      >
        {exporting ? 'Exporting...' : 'Export CSV'}
      </button>
      <button 
        onClick={exportToJSON}
        disabled={exporting || !data || data.length === 0}
        className="export-btn json-btn"
      >
        {exporting ? 'Exporting...' : 'Export JSON'}
      </button>
    </div>
  );
};

export default ExportButton;