const LEVENSHTEIN_MAX_INDEX = 50;
const NON_WORD_RE = /[^\w, ]+/;

class FuzzySet {
  constructor(arr = [], useLevenshtein = true, gramSizeLower = 2, gramSizeUpper = 3) {
  	// define all the object functions and attributes
  	this.exactSet = {};
  	this.matchDict = {};
  	this.items = {};
    
    // initialization
    this.useLevenshtein = useLevenshtein;
    this.gramSizeLower = gramSizeLower;
    this.gramSizeUpper = gramSizeUpper;
    
    for (let i = gramSizeLower; i < gramSizeUpper + 1; ++i) {
      this.items[i] = [];
    }
    
    // add all the items to the set
    for (let i = 0; i < arr.length; ++i) {
      this.add(arr[i]);
    }
  }

  // the main functions
  get(value, defaultValue = null) {
    let normalizedValue = this.normalizeString(value),
        result = this.exactSet[normalizedValue];
        
    if (result) {
      return [
        [1, result]
      ];
    }

    let results = [];
    
    // start with high gram size and if there are no results, go to lower gram sizes
    for (let gramSize = this.gramSizeUpper; gramSize >= this.gramSizeLower; --gramSize) {
      results = this.getUsingGram(value, gramSize);
      if (results && results.length) {
        return results;
      }
    }
    
    return defaultValue;
  }

  getUsingGram(value, gramSize) {
    let matches = {},
        gramCounts = gramCounter(value, gramSize),
        items = this.items[gramSize],
        sumOfSquareGramCounts = 0,
        gramCount,
        index,
        otherGramCount;

    for (let gram in gramCounts) {
      if (Object.prototype.hasOwnProperty.call(gramCounts, gram)) {
        gramCount = gramCounts[gram];
        sumOfSquareGramCounts += gramCount * gramCount;
        
        if (gram in this.matchDict) {
          for (let i = 0; i < this.matchDict[gram].length; ++i) {
            index = this.matchDict[gram][i][0];
            otherGramCount = this.matchDict[gram][i][1];
            
            if (index in matches) {
              matches[index] += gramCount * otherGramCount;
            } else {
              matches[index] = gramCount * otherGramCount;
            }
          }
        }
      }
    }

    if (isEmptyObject(matches)) {
      return null;
    }

    let vectorNormal = Math.sqrt(sumOfSquareGramCounts),
        results = [],
        matchScore;
        
    // build a results list of [score, str]
    for (let matchIndex in matches) {
      if (Object.prototype.hasOwnProperty.call(matches, matchIndex)) {
        matchScore = matches[matchIndex];
        results.push([matchScore / (vectorNormal * items[matchIndex][0]), items[matchIndex][1]]);
      }
    }
        
    if (this.useLevenshtein) {
      // truncate somewhat arbitrarily:
      let endIndex = Math.min(LEVENSHTEIN_MAX_INDEX, results.length);
      results.sort(sortDescending);
        
      for (let i = 0; i < endIndex; ++i) {
        results[i] = [distance(results[i][1], value), results[i][1]];
      }
    }
    
    results.sort(sortDescending);
    
    let newResults = [];
    for (let i = 0; i < results.length; ++i) {
      if (results[i][0] === results[0][0]) {
        newResults.push([results[i][0], this.exactSet[results[i][1]]]);
      }
    }
    return newResults;
  }

  add(value) {
    let  normalizedValue = this.normalizeString(value);
    if (normalizedValue in this.exactSet) {
      return false;
    }

    for (let i = this.gramSizeLower; i < this.gramSizeUpper + 1; ++i) {
      this.addWithGramsize(value, i);
    }
  }

  addWithGramsize(value, gramSize) {
    let items = this.items[gramSize] || [],
        index = items.length;

    items.push(0);
    let gramCounts = gramCounter(value, gramSize),
        sumOfSquareGramCounts = 0,
        gramCount;
        
    for (let gram in gramCounts) {
      if (Object.prototype.hasOwnProperty.call(gramCounts, gram)) {
        gramCount = gramCounts[gram];
        sumOfSquareGramCounts += gramCount * gramCount;
        if (gram in this.matchDict) {
          this.matchDict[gram].push([index, gramCount]);
        } else {
          this.matchDict[gram] = [
            [index, gramCount]
          ];
        }
      }
    }
    
    let vectorNormal = Math.sqrt(sumOfSquareGramCounts);
    items[index] = [vectorNormal, value];
    this.items[gramSize] = items;
    this.exactSet[value] = value;
  }

  normalizeString(str) {
    if (Object.prototype.toString.call(str) !== '[object String]') {
      throw Error('Must use a string as argument to FuzzySet functions');
    }
    return str.toLowerCase();
  }

  // return length of items in set
  length() {
    return Object.keys(this.exactSet).length;
  }

  // return is set is empty
  isEmpty() {
    return isEmptyObject(this.exactSet);
  }

  // return list of values loaded into set
  values() {
    let values = [];
        
    for (let prop in this.exactSet) {
      if (Object.prototype.hasOwnProperty.call(this.exactSet, prop)) {
        values.push(this.exactSet[prop]);
      }
    }
    return values;
  }
}

FuzzySet.version = '0.0.2';
export default FuzzySet;

// helper functions
function levenshtein(str1, str2) {
  let current = [],
      prev, value;

  for (let i = 0; i <= str2.length; i++) {
    for (let j = 0; j <= str1.length; j++) {
      if (i && j) {
        if (str1.charAt(j - 1) === str2.charAt(i - 1)) {
          value = prev;
        } else {
          value = Math.min(current[j], current[j - 1], prev) + 1;
        }
      } else {
        value = i + j;
      }

      prev = current[j];
      current[j] = value;
    }
  }

  return current.pop();
}

// return an edit distance from 0 to 1
function distance (str1, str2) {
  if (str1 === null && str2 === null) {
    throw Error('Trying to compare two null values');
  }
  
  if (str1 === null || str2 === null) {
    return 0;
  }
  
  str1 = String(str1);
  str2 = String(str2);

  let distanceValue = levenshtein(str1, str2);
  if (str1.length > str2.length) {
    return 1 - distanceValue / str1.length;
  } else {
    return 1 - distanceValue / str2.length;
  }
}

function iterateGrams(value, gramSize = 2) {
  let simplified = '-' + value.toLowerCase().replace(NON_WORD_RE, '') + '-',
      lenDiff = gramSize - simplified.length,
      results = [];
      
  if (lenDiff > 0) {
    for (let i = 0; i < lenDiff; ++i) {
      value += '-';
    }
  }
  
  for (let i = 0; i < simplified.length - gramSize + 1; ++i) {
    results.push(simplified.slice(i, i + gramSize));
  }
  
  return results;
}

function gramCounter(value, gramSize = 2) {
  // return an object where key=gram, value=number of occurrences
  let result = {},
      grams = iterateGrams(value, gramSize);
      
  for (let i = 0; i < grams.length; ++i) {
    if (grams[i] in result) {
      result[grams[i]] += 1;
    } else {
      result[grams[i]] = 1;
    }
  }
  return result;
}

function isEmptyObject(obj) {
  for (let prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      return false;
    }
  }
  return true;
}

function sortDescending(a, b) {
  if (a[0] < b[0]) {
    return 1;
  } else if (a[0] > b[0]) {
    return -1;
  } else {
    return 0;
  }
}
