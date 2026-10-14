export function visibleInstruments<T extends Record<string,unknown>>(rows:T[],showOutOfPlay:boolean):T[]{
  return showOutOfPlay?rows:rows.filter(row=>row.show_in_play===true);
}
