/** Pre-defined MOIL mining blocks rendered as selectable polygons. */

import { Polygon, Tooltip } from 'react-leaflet';

import { MINING_BLOCKS } from '../../data/miningBlocks.js';

export default function MiningBlocks({ selectedId, onSelect }) {
  return (
    <>
      {MINING_BLOCKS.map((block) => {
        const isSelected = block.id === selectedId;
        const positions = block.polygon.map(([lng, lat]) => [lat, lng]);

        return (
          <Polygon
            key={block.id}
            positions={positions}
            pathOptions={{
              color: isSelected ? '#38bdf8' : '#a5b4fc',
              weight: isSelected ? 3 : 1.5,
              opacity: 0.95,
              dashArray: isSelected ? null : '4 4',
              fillColor: isSelected ? '#38bdf8' : '#818cf8',
              fillOpacity: isSelected ? 0.2 : 0.08,
            }}
            eventHandlers={{ click: () => onSelect?.(block) }}
          >
            <Tooltip sticky className="text-xs">
              <div>
                <p className="m-0 font-semibold">{block.name}</p>
                <p className="m-0 text-slate-600">
                  {block.district}, {block.state}
                </p>
                <p className="m-0 text-slate-500">{block.commodity}</p>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

export { MINING_BLOCKS };
