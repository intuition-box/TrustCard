export const FIND_ATOM_BY_LABEL_QUERY = `
  query FindAtomByLabel($label: String!) {
    atoms(
      limit: 1
      where: { label: { _eq: $label } }
    ) {
      term_id
      label
      image
    }
  }
`

export const FIND_ATOMS_BY_LABEL_SEARCH = `
  query FindAtomsByLabelSearch($pattern: String!) {
    atoms(
      where: { label: { _ilike: $pattern } }
      order_by: { label: asc }
      limit: 10
    ) {
      term_id
      label
      image
    }
  }
`

export const GET_ATOM_MARKETCAPS_QUERY = `
  query GetAtomMarketCaps($termIds: [String!]!) {
    vaults(where: { term_id: { _in: $termIds } }) {
      term_id
      curve_id
      market_cap
      position_count
    }
  }
`

export const GET_TRUSTCARD_TRIPLES_QUERY = `
  query GetTrustCardTriples($predicateId: String!, $objectId: String!) {
    triples(
      where: {
        predicate: { term_id: { _eq: $predicateId } }
        object: { term_id: { _eq: $objectId } }
      }
      order_by: { created_at: desc }
    ) {
      term_id
      subject {
        term_id
        label
        image
        value {
          person { url }
          organization { url }
          thing { url }
        }
      }
      predicate {
        term_id
        label
        image
      }
      object {
        term_id
        label
        image
      }
      term {
        vaults {
          term_id
          curve_id
          total_shares
          current_share_price
          market_cap
          position_count
        }
      }
      counter_term {
        vaults {
          term_id
          curve_id
          total_shares
          current_share_price
          market_cap
          position_count
        }
      }
    }
  }
`

export const FIND_TRUSTCARD_TRIPLE_FOR_SUBJECT_QUERY = `
  query FindTripleForSubject(
    $subjectId: String!
    $predicateId: String!
    $objectId: String!
  ) {
    triples(
      limit: 1
      where: {
        subject: { term_id: { _eq: $subjectId } }
        predicate: { term_id: { _eq: $predicateId } }
        object: { term_id: { _eq: $objectId } }
      }
    ) {
      term_id
      subject {
        term_id
        label
        image
        value {
          person { url }
          organization { url }
          thing { url }
        }
      }
      predicate {
        term_id
        label
        image
      }
      object {
        term_id
        label
        image
      }
      term {
        vaults {
          term_id
          curve_id
          total_shares
          current_share_price
          market_cap
          position_count
        }
      }
      counter_term {
        vaults {
          term_id
          curve_id
          total_shares
          current_share_price
          market_cap
          position_count
        }
      }
    }
  }
`

// 🔹 Nouvelle mutation: pinPerson, alignée sur le schéma Mutation_Root.pinPerson(person: PinPersonInput)
export const PIN_PERSON_MUTATION = `
  mutation PinPerson(
    $name: String!
    $description: String
    $image: String
    $url: String
    $email: String
    $identifier: String
  ) {
    pinPerson(
      person: {
        name: $name
        description: $description
        image: $image
        url: $url
        email: $email
        identifier: $identifier
      }
    ) {
      uri
    }
  }
`
